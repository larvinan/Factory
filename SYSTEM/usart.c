#include "usart.h"

uint8_t usart_rx_buf[USART_RX_BUF_LEN] = {0};
uint16_t usart_rx_cnt = 0;

/**
 * @brief USART1初始化，PA9(TX) PA10(RX)
 * @param baudrate 波特率，项目使用115200
 */
void usart1_init(uint32_t baudrate)
{
    GPIO_InitTypeDef gpio_conf;
    USART_InitTypeDef usart_conf;
    NVIC_InitTypeDef nvic_conf;

    // 开启GPIOA、USART1外设时钟
    RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOA | RCC_APB2Periph_USART1, ENABLE);

    // PA9 TX 复用推挽输出
    gpio_conf.GPIO_Pin = GPIO_Pin_9;
    gpio_conf.GPIO_Mode = GPIO_Mode_AF_PP;
    gpio_conf.GPIO_Speed = GPIO_Speed_50MHz;
    GPIO_Init(GPIOA, &gpio_conf);

    // PA10 RX 浮空输入
    gpio_conf.GPIO_Pin = GPIO_Pin_10;
    gpio_conf.GPIO_Mode = GPIO_Mode_IN_FLOATING;
    GPIO_Init(GPIOA, &gpio_conf);

    // 串口基础配置：波特率、8数据位、1停止位、无校验
    usart_conf.USART_BaudRate = baudrate;
    usart_conf.USART_WordLength = USART_WordLength_8b;
    usart_conf.USART_StopBits = USART_StopBits_1;
    usart_conf.USART_Parity = USART_Parity_No;
    usart_conf.USART_HardwareFlowControl = USART_HardwareFlowControl_None;
    usart_conf.USART_Mode = USART_Mode_Rx | USART_Mode_Tx; // 收发都开启
    USART_Init(USART1, &usart_conf);

    USART_ITConfig(USART1, USART_IT_RXNE, ENABLE); // 开启接收中断
    USART_Cmd(USART1, ENABLE);                    // 使能串口

    // 配置串口中断优先级
    nvic_conf.NVIC_IRQChannel = USART1_IRQn;
    nvic_conf.NVIC_IRQChannelPreemptionPriority = 1;
    nvic_conf.NVIC_IRQChannelSubPriority = 1;
    nvic_conf.NVIC_IRQChannelCmd = ENABLE;
    NVIC_Init(&nvic_conf);
}

/**
 * @brief 串口发送一组数据
 * @param buf：待发送数据首地址
 * @param len：发送字节长度
 */
void usart_send_data(uint8_t *buf, uint16_t len)
{
    uint16_t i;
    for(i=0; i<len; i++)
    {
        // 等待发送寄存器为空，再发送下一字节
        while(USART_GetFlagStatus(USART1, USART_FLAG_TXE) == RESET);
        USART_SendData(USART1, buf[i]);
    }
}

/**
 * @brief USART1中断服务函数：接收数据存入缓存
 */
void USART1_IRQHandler(void)
{
    // 判断是否是接收完成中断
    if(USART_GetITStatus(USART1, USART_IT_RXNE) != RESET)
    {
        usart_rx_buf[usart_rx_cnt++] = USART_ReceiveData(USART1); // 读取数据存入缓存
        if(usart_rx_cnt >= USART_RX_BUF_LEN) // 缓存溢出保护，计数器清零
            usart_rx_cnt = 0;
        USART_ClearITPendingBit(USART1, USART_IT_RXNE); // 清除中断标志
    }
}

