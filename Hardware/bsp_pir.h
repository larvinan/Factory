#ifndef __BSP_PIR_H
#define __BSP_PIR_H

#include "stm32f10x.h"



/************************** PIR 连接引脚定义 ********************************/
/* 人体红外传感器（HC-SR501 等）OUT 脚接 STM32 GPIO。
 * 检测到人体时 OUT 输出高电平，无人时输出低电平。
 * 改接其它引脚只需修改下面三处宏。
 */
#define      PIR_GPIO_PORT                       GPIOA
#define      PIR_GPIO_CLK                        RCC_APB2Periph_GPIOA
#define      PIR_GPIO_PIN                        GPIO_Pin_4



/************************** PIR 函数声明 ***********************************/
void                     PIR_Init                            ( void );
uint8_t                  PIR_Detect                          ( void );   /* 1=有人 0=无人 */



#endif /* __BSP_PIR_H */
