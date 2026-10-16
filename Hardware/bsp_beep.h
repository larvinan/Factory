#ifndef __BSP_BEEP_H
#define __BSP_BEEP_H

#include "stm32f10x.h"



/************************** 蜂鸣器连接引脚定义 ******************************/
/* 当前默认接法：控制脚 → PB15（与项目其它占用引脚无冲突，避开 Key2 的 PB13）
 * 改接其它引脚只需修改下面三处宏
 */
#define      BEEP_GPIO_PORT                      GPIOB
#define      BEEP_GPIO_CLK                       RCC_APB2Periph_GPIOB
#define      BEEP_GPIO_PIN                        GPIO_Pin_15

/************************** 触发电平配置 ************************************/
/* 1 = 高电平触发响铃（常见有源蜂鸣器模块多数如此）
 * 0 = 低电平触发响铃
 * 接线后用万用表/上电试一次确认，改这一处即可，函数无需改动
 */
#define      BEEP_ACTIVE_HIGH                     1



/************************** 蜂鸣器函数声明 **********************************/
void                     BEEP_Init                           ( void );
void                     BEEP_On                             ( void );
void                     BEEP_Off                            ( void );

/* —— 非阻塞滴答鸣叫 ——
 * 用法：
 *   BEEP_TickStart ( 200, 200 );   // 进入滴答模式：200ms 响 + 200ms 停
 *   while (1) {
 *       ...
 *       BEEP_TickUpdate ( 100 );   // 每次主循环调用，传入本次循环耗时(ms)
 *   }
 *   BEEP_TickStop ();              // 退出滴答模式并静音
 */
void                     BEEP_TickStart                      ( uint16_t on_ms, uint16_t off_ms );
void                     BEEP_TickStop                       ( void );
void                     BEEP_TickUpdate                     ( uint16_t loop_period_ms );
uint8_t                  BEEP_IsActive                       ( void );



#endif /* __BSP_BEEP_H */
