#ifndef __BSP_UPLINK_H
#define __BSP_UPLINK_H

/* ================================================================
 * bsp_uplink：STM32 ←(TTL 串口)→ RK3568 有线传输层
 *
 * 功能：
 *   - 通过 USART3(TX=PB10 / RX=PB11) 周期把传感器 & 设备状态
 *     打成 protocol.h 定义的 Frame_t 发给 RK3568
 *   - 同时监听 RK3568 下发的 DATA_CTRL 命令帧(继电器/RGB/库存改写等)
 *   - 非阻塞 Tick 推进，主循环调用即可
 *
 * 位置：本文件位于 SYSTEM 目录（与 protocol.c 同组，属协议传输层）
 *
 * 使用步骤：
 *   1) Keil 工程 SYSTEM 组 Add bsp_uplink.c
 *   2) main.c 中 system_init() 内调用 Uplink_Init(),
 *      while(1) 循环末尾调用 Uplink_TickUpdate(MAIN_LOOP_MS, &g_app)
 * ================================================================
 */

#include "stm32f10x.h"
#include "bsp_display.h"   /* App_State_t */
#include "protocol.h"      /* Frame_t / Data_Type */



/************************** 串口连接 RK3568 的引脚（USART3） **************/
/* STM32F103C8 USART3：TX=PB10  RX=PB11
 * 选 USART3 是为了避开 MQ2(PA2/ADC)、MQ5(PA0/ADC)，
 * PB10/PB11 在本项目中未被占用。
 */
#define UPLINK_USART                     USART3
#define UPLINK_USART_CLK                 RCC_APB1Periph_USART3
#define UPLINK_USART_GPIO_CLK            RCC_APB2Periph_GPIOB
#define UPLINK_USART_GPIO_PORT           GPIOB
#define UPLINK_USART_TX_PIN              GPIO_Pin_10
#define UPLINK_USART_RX_PIN              GPIO_Pin_11
#define UPLINK_USART_IRQn                USART3_IRQn
#define UPLINK_USART_BAUD                115200u

/* 串口接收缓冲区长度(一帧最多 HEAD+type+len+payload+chk+tail = 5+64 = 69 字节) */
#define UPLINK_RX_BUF_SIZE               256u

/* 上传周期(ms)：每过此时间，发送一帧完整的传感器数据给 RK3568 */
#define UPLINK_TX_PERIOD_MS              2000u   /* 2s 一次，足够反应环境变化 */

/* data_type 与现有 protocol.h Data_Type 保持一致，
 * 另外新增一个"整包状态"类型便于一帧推全部状态（RK JSON 更省事）
 */
#ifndef DATA_SNAPSHOT
#define DATA_SNAPSHOT                    0x05    /* 一次性整包快照 */
#endif
#ifndef DATA_CTRL_ACK
#define DATA_CTRL_ACK                    0x11    /* 命令执行结果回执 */
#endif



/************************** 传感器整包快照 payload 结构（RK 端解析用） **/
/* 注意两端字节序都用小端(STM32 原生即小端)，RK3568 也小端，无需转换 */
#pragma pack(push, 1)
typedef struct
{
    /* DHT11 */
    int16_t  temp_x10;        /* 温度×10  (253 = 25.3°C)，-999~999 */
    int16_t  humi_x10;        /* 湿度×10  (550 = 55.0%) */

    /* MQ5 + MQ2 */
    uint16_t mq5_ppm;         /* 可燃气体 ppm */
    uint16_t mq2_ppm;         /* 烟雾 ppm     */
    uint8_t  mq5_level;       /* 等级 0~100   */
    uint8_t  mq2_level;       /* 等级 0~100   */

    /* 环境 / 状态 */
    uint16_t ldr_adc;         /* 光敏 ADC    */
    uint8_t  pir_person;      /* 人体 1/0    */
    uint8_t  light_on;        /* 继电器 灯 1/0 */
    uint8_t  rgb_color;       /* RGB_Color 枚举值 0~7 */
    uint8_t  beep_active;     /* 蜂鸣器 1/0  */

    /* 计数 / 库存 */
    uint16_t count;           /* RAM 当前计数 */
    uint16_t stock;           /* Flash 缓存库存 */
} Uplink_Snapshot_t;   /* 22 字节 payload */
#pragma pack(pop)

/* DATA_CTRL 命令帧 payload 结构（RK → STM32） */
#pragma pack(push, 1)
typedef struct
{
    uint8_t  cmd;             /* 命令码，见 UPLINK_CMD_* */
    uint8_t  param_u8;        /* 单字节参数（如 RGB 颜色） */
    uint16_t param_u16;       /* 双字节参数（如库存值）   */
} Uplink_Ctrl_t;
#pragma pack(pop)

#define UPLINK_CMD_RELAY             0x01    /* param_u8:1=吸合 0=释放；触发手动保持窗口(暂停自动照明) */
#define UPLINK_CMD_RGB               0x02    /* param_u8:RGB_Color；触发手动保持窗口(暂停自动声光) */
#define UPLINK_CMD_BEEP_TICK         0x03    /* param_u8:1=开滴答 0=关，param_u16= 高8=on_ms 低8=off_ms */
#define UPLINK_CMD_STOCK_REWRITE     0x04    /* param_u16=新库存值，调用 CountSensor_RewriteFlashStock */
#define UPLINK_CMD_STOCK_RESET       0x05    /* 清库存并写 Flash */
#define UPLINK_CMD_RESUME_AUTO       0x06    /* 预留：立即结束手动保持，恢复自动(当前上位机未用，不影响) */

/* —— 手动控制保持时长(参数修改入口) ——
 * 前端下发 relay/rgb/beep 命令后，对应自动状态机暂停此时长，超时后自动恢复。
 * 想改保持时长(如 60 秒)改这里：60000u
 */
#define UPLINK_MANUAL_OVERRIDE_MS        30000u



/************************** Uplink 函数声明 ********************************/
void Uplink_Init ( void );
void Uplink_TickUpdate ( uint16_t loop_ms, App_State_t * state );
uint8_t Uplink_LightOverrideActive ( void );   /* 1=照明处于手动保持期(自动照明暂停) */
uint8_t Uplink_AlarmOverrideActive ( void );   /* 1=声光报警处于手动保持期(自动报警声光暂停) */



#endif /* __BSP_UPLINK_H */
