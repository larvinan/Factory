#ifndef __USART_H
#define __USART_H

#include "stm32f10x.h"

// 串口接收缓冲区大小
#define USART_RX_BUF_LEN 128
extern uint8_t usart_rx_buf[USART_RX_BUF_LEN]; // 接收缓存数组
extern uint16_t usart_rx_cnt;                  // 有效接收字节计数

void usart1_init(uint32_t baudrate);               // USART1初始化
void usart_send_data(uint8_t *buf, uint16_t len);  // 串口发送指定长度数据

#endif
