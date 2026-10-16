#ifndef __BSP_RELAY_H
#define __BSP_RELAY_H

#include "stm32f10x.h"



/************************** 继电器连接引脚定义 ******************************/
/* 继电器模块 IN 脚接 STM32 GPIO 推挽输出。
 * 改接其它引脚只需修改下面三处宏。
 */
#define      RELAY_GPIO_PORT                     GPIOA
#define      RELAY_GPIO_CLK                      RCC_APB2Periph_GPIOA
#define      RELAY_GPIO_PIN                       GPIO_Pin_6

/************************** 触发电平配置 ************************************/
/* 1 = 低电平触发吸合（市面多数继电器模块如此，含光耦+三极管反向驱动）
 * 0 = 高电平触发吸合
 * 接线后用万用表或听继电器"咔嗒"声确认，必要时改这一处即可
 */
#define      RELAY_ACTIVE_LOW                      1



/************************** 继电器函数声明 **********************************/
void                     RELAY_Init                         ( void );
void                     RELAY_On                          ( void );   /* 吸合，常开触点闭合 */
void                     RELAY_Off                         ( void );   /* 释放，常开触点断开 */



#endif /* __BSP_RELAY_H */
