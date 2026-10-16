#include "bsp_uplink.h"
#include "protocol.h"
#include "CountSensor.h"
#include "bsp_rgb.h"
#include "bsp_beep.h"
#include "bsp_relay.h"
#include <string.h>



/* 接收环形缓冲：把接收到的字节累积起来，在 Tick 中做"帧搜索" */
static uint8_t  s_rx_buf[UPLINK_RX_BUF_SIZE];
static uint16_t s_rx_wr = 0;     /* 写入下标（ISR 写） */
static uint16_t s_rx_rd = 0;     /* 读取下标（Tick 读） */

/* 上传计时器 */
static uint32_t s_tx_elapsed_ms = 0;

/* —— 手动控制保持计时：前端 relay/rgb/beep 命令的"手动优先"窗口 ——
 * >0 时对应自动状态机(main.c)让位；每轮 Tick 递减，归零后自动恢复 */
static uint32_t s_light_override_ms = 0;   /* >0: 自动照明暂停 */
static uint32_t s_alarm_override_ms = 0;   /* >0: 自动报警声光暂停 */
static App_State_t * s_app = NULL;         /* 命令执行时同步 g_app，让 OLED 显示跟手 */

/* USART3 单字节发送（阻塞式，一帧才 30 字节，阻塞 ~3ms 可接受） */
static void Uplink_USART_Send ( const uint8_t * buf, uint16_t len )
{
    uint16_t i;
    for ( i = 0; i < len; i++ )
    {
        while ( USART_GetFlagStatus ( UPLINK_USART, USART_FLAG_TXE ) == RESET );
        USART_SendData ( UPLINK_USART, buf[i] );
    }
    while ( USART_GetFlagStatus ( UPLINK_USART, USART_FLAG_TC ) == RESET );
}

/* 把 App_State_t 转换为 Uplink_Snapshot_t payload */
static void Uplink_BuildSnapshot ( const App_State_t * s, Uplink_Snapshot_t * snap )
{
    memset ( snap, 0, sizeof(*snap) );
    snap->temp_x10   = (int16_t)( s->dht11.temp_int * 10 + s->dht11.temp_deci );
    snap->humi_x10   = (int16_t)( s->dht11.humi_int * 10 + s->dht11.humi_deci );
    snap->mq5_ppm    = s->mq5.ppm;
    snap->mq2_ppm    = s->mq2.ppm;
    snap->mq5_level  = s->mq5.level;
    snap->mq2_level  = s->mq2.level;
    snap->ldr_adc    = s->ldr.adc_value;
    snap->pir_person = s->pir;
    snap->light_on   = s->light_on;
    snap->rgb_color  = (uint8_t)s->rgb_color;
    snap->beep_active = BEEP_IsActive() ? 1 : 0;
    snap->count      = s->count;
    snap->stock      = s->stock;
}

/* 打一帧 DATA_SNAPSHOT 并发送 */
static void Uplink_SendSnapshot ( const App_State_t * s )
{
    Frame_t frame;
    Uplink_Snapshot_t snap;
    uint8_t raw[128];
    int n;

    memset ( &frame, 0, sizeof(frame) );
    frame.head      = FRAME_HEAD;
    frame.data_type = DATA_SNAPSHOT;
    frame.len       = (uint8_t)sizeof(snap);
    Uplink_BuildSnapshot ( s, &snap );
    memcpy ( frame.payload, &snap, sizeof(snap) );
    frame.tail      = FRAME_TAIL;

    n = pack_frame ( &frame, raw );
    if ( n > 0 ) Uplink_USART_Send ( raw, (uint16_t)n );
}

/* 发送 DATA_CTRL_ACK 回执帧，payload=2 字节：[cmd,result(0成功 1失败)] */
static void Uplink_SendCtrlAck ( uint8_t cmd, uint8_t result )
{
    Frame_t frame;
    uint8_t raw[32];
    int n;
    memset ( &frame, 0, sizeof(frame) );
    frame.head      = FRAME_HEAD;
    frame.data_type = DATA_CTRL_ACK;
    frame.len       = 2;
    frame.payload[0] = cmd;
    frame.payload[1] = result;
    frame.tail      = FRAME_TAIL;
    n = pack_frame ( &frame, raw );
    if ( n > 0 ) Uplink_USART_Send ( raw, (uint16_t)n );
}

/* 解析并执行一条 DATA_CTRL 命令帧 */
static void Uplink_HandleCtrl ( const Frame_t * frame )
{
    const Uplink_Ctrl_t * c;
    uint8_t result = 0;
    if ( frame == NULL || frame->len < sizeof(Uplink_Ctrl_t) )
    {
        Uplink_SendCtrlAck ( 0, 1 );
        return;
    }
    c = (const Uplink_Ctrl_t *)frame->payload;

    switch ( c->cmd )
    {
        case UPLINK_CMD_RELAY:
            if ( c->param_u8 ) RELAY_On (); else RELAY_Off ();
            if ( s_app != NULL ) s_app->light_on = ( c->param_u8 != 0 );   /* 同步 OLED 显示 */
            s_light_override_ms = UPLINK_MANUAL_OVERRIDE_MS;               /* 手动保持：暂停自动照明 */
            break;
        case UPLINK_CMD_RGB:
            if ( c->param_u8 <= RGB_WHITE )
            {
                RGB_SetColor ( (RGB_Color)c->param_u8 );
                if ( s_app != NULL ) s_app->rgb_color = (RGB_Color)c->param_u8;
                s_alarm_override_ms = UPLINK_MANUAL_OVERRIDE_MS;           /* 手动保持：暂停自动声光 */
            }
            else result = 1;
            break;
        case UPLINK_CMD_BEEP_TICK:
        {
            uint16_t on_ms  = (uint16_t)( ( c->param_u16 >> 8 ) & 0xFF );
            uint16_t off_ms = (uint16_t)( c->param_u16 & 0xFF );
            if ( on_ms == 0 || off_ms == 0 )
                BEEP_TickStop ();
            else
                BEEP_TickStart ( on_ms, off_ms );
            s_alarm_override_ms = UPLINK_MANUAL_OVERRIDE_MS;               /* 手动保持：暂停自动声光 */
            break;
        }
        case UPLINK_CMD_STOCK_REWRITE:
            CountSensor_RewriteFlashStock ( c->param_u16 );
            break;
        case UPLINK_CMD_STOCK_RESET:
            CountSensor_Reset ();
            CountSensor_ForceSave ();
            break;
        case UPLINK_CMD_RESUME_AUTO:
            s_light_override_ms = 0;    /* 立即恢复自动(预留命令，当前上位机未用) */
            s_alarm_override_ms = 0;
            break;
        default:
            result = 1;
            break;
    }
    Uplink_SendCtrlAck ( c->cmd, result );
}

/* 从环形缓冲中尝试取出一帧完整帧；返回 1=已取到并执行，0=还不够 */
static uint8_t Uplink_TryConsumeFrame ( void )
{
    /* 线性扫描 HEAD 位置 */
    uint16_t i;
    uint16_t avail;
    avail = ( s_rx_wr + UPLINK_RX_BUF_SIZE - s_rx_rd ) % UPLINK_RX_BUF_SIZE;
    if ( avail < 5 ) return 0;   /* HEAD+TYPE+LEN+CHK+TAIL 最小 5B */

    for ( i = 0; i < avail; i++ )
    {
        uint16_t p = ( s_rx_rd + i ) % UPLINK_RX_BUF_SIZE;
        if ( s_rx_buf[p] != FRAME_HEAD ) continue;

        /* HEAD 后读 TYPE、LEN：需要至少再读 2 字节 */
        if ( i + 3 > avail ) return 0;
        uint8_t data_type = s_rx_buf[ ( p + 1 ) % UPLINK_RX_BUF_SIZE ];
        uint8_t len       = s_rx_buf[ ( p + 2 ) % UPLINK_RX_BUF_SIZE ];
        if ( len > MAX_FRAME_LEN )
        {
            /* 非法帧：跳过这个 HEAD */
            s_rx_rd = ( p + 1 ) % UPLINK_RX_BUF_SIZE;
            return 1;
        }
        uint16_t frame_total = 3 + len + 2;     /* HEAD+TYPE+LEN + payload + CHK+TAIL */
        if ( i + frame_total > avail ) return 0; /* 还没收齐 */

        /* 把整帧拷到线性缓冲区，然后交给 unpack_frame */
        uint8_t tmp[128];
        uint16_t k;
        for ( k = 0; k < frame_total; k++ )
            tmp[k] = s_rx_buf[ ( p + k ) % UPLINK_RX_BUF_SIZE ];

        Frame_t frame;
        int rc = unpack_frame ( tmp, (int)frame_total, &frame );
        /* 消费掉这部分字节 */
        s_rx_rd = ( p + frame_total ) % UPLINK_RX_BUF_SIZE;

        if ( rc == 0 )
        {
            if ( data_type == DATA_CTRL )
                Uplink_HandleCtrl ( &frame );
            /* 其他类型：RK 发给 STM32 我们暂时不处理，忽略即可 */
        }
        return 1;
    }

    /* 扫描完整个接收区都没找到 HEAD，把读指针拉到写指针前，避免下次重扫 */
    s_rx_rd = ( s_rx_wr + UPLINK_RX_BUF_SIZE - 1 ) % UPLINK_RX_BUF_SIZE;
    return 0;
}



/**
  * @brief  初始化 Uplink 通道：GPIO + USART3 + 接收中断
  * @param  无
  * @retval 无
  */
void Uplink_Init ( void )
{
    GPIO_InitTypeDef GPIO_InitStructure;
    USART_InitTypeDef USART_InitStructure;
    NVIC_InitTypeDef NVIC_InitStructure;

    /* 1. GPIO 时钟 */
    RCC_APB2PeriphClockCmd ( UPLINK_USART_GPIO_CLK, ENABLE );
    /* 2. USART3 时钟 (APB1) */
    RCC_APB1PeriphClockCmd ( UPLINK_USART_CLK, ENABLE );

    /* TX = PB10 = 复用推挽 */
    GPIO_InitStructure.GPIO_Pin   = UPLINK_USART_TX_PIN;
    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_AF_PP;
    GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init ( UPLINK_USART_GPIO_PORT, &GPIO_InitStructure );

    /* RX = PB11 = 浮空输入 */
    GPIO_InitStructure.GPIO_Pin   = UPLINK_USART_RX_PIN;
    GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_IN_FLOATING;
    GPIO_Init ( UPLINK_USART_GPIO_PORT, &GPIO_InitStructure );

    /* 3. USART 参数 */
    USART_InitStructure.USART_BaudRate            = UPLINK_USART_BAUD;
    USART_InitStructure.USART_WordLength          = USART_WordLength_8b;
    USART_InitStructure.USART_StopBits            = USART_StopBits_1;
    USART_InitStructure.USART_Parity              = USART_Parity_No;
    USART_InitStructure.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    USART_InitStructure.USART_Mode                = USART_Mode_Rx | USART_Mode_Tx;
    USART_Init ( UPLINK_USART, &USART_InitStructure );

    /* 4. 开启接收中断 */
    USART_ITConfig ( UPLINK_USART, USART_IT_RXNE, ENABLE );
    NVIC_InitStructure.NVIC_IRQChannel                   = UPLINK_USART_IRQn;
    NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 2;
    NVIC_InitStructure.NVIC_IRQChannelSubPriority        = 2;
    NVIC_InitStructure.NVIC_IRQChannelCmd                = ENABLE;
    NVIC_Init ( &NVIC_InitStructure );

    USART_Cmd ( UPLINK_USART, ENABLE );

    s_rx_wr = s_rx_rd = 0;
    s_tx_elapsed_ms = 0;
}


/**
  * @brief  周期推进：到时间就发一帧快照、并尝试把收到的命令解析执行
  * @param  loop_ms：本轮循环耗时 ms
  * @param  state  ：应用当前状态（非 const：命令执行时需同步显示字段）
  * @retval 无
  */
void Uplink_TickUpdate ( uint16_t loop_ms, App_State_t * state )
{
    s_app = state;

    /* 手动保持计时递减（饱和归零） */
    if ( s_light_override_ms > (uint32_t)loop_ms ) s_light_override_ms -= loop_ms;
    else                                           s_light_override_ms = 0;
    if ( s_alarm_override_ms > (uint32_t)loop_ms ) s_alarm_override_ms -= loop_ms;
    else                                           s_alarm_override_ms = 0;

    s_tx_elapsed_ms += loop_ms;
    if ( s_tx_elapsed_ms >= UPLINK_TX_PERIOD_MS )
    {
        s_tx_elapsed_ms = 0;
        if ( state != NULL ) Uplink_SendSnapshot ( state );
    }

    while ( Uplink_TryConsumeFrame () ) { /* 循环解帧，直到没完整帧 */ }
}


/* 查询手动保持状态：1=保持中(对应自动状态机应让位)，0=已恢复自动 */
uint8_t Uplink_LightOverrideActive ( void )
{
    return ( s_light_override_ms > 0u ) ? 1u : 0u;
}

uint8_t Uplink_AlarmOverrideActive ( void )
{
    return ( s_alarm_override_ms > 0u ) ? 1u : 0u;
}


/* ============ USART3 接收 ISR：把字节压入环形缓冲 ============
 * 已确认 User/stm32f10x_it.c 中无 USART3_IRQHandler，此处独占该中断入口
 */
void USART3_IRQHandler ( void )
{
    if ( USART_GetITStatus ( UPLINK_USART, USART_IT_RXNE ) != RESET )
    {
        uint16_t ch = USART_ReceiveData ( UPLINK_USART );
        uint16_t next = (uint16_t)( ( s_rx_wr + 1 ) % UPLINK_RX_BUF_SIZE );
        if ( next != s_rx_rd )   /* 非满则写入 */
        {
            s_rx_buf[s_rx_wr] = (uint8_t)ch;
            s_rx_wr = next;
        }
        /* 满就丢（这是正常的背压，不会崩溃）*/
        USART_ClearITPendingBit ( UPLINK_USART, USART_IT_RXNE );
    }
}


/*************************************END OF FILE******************************/
