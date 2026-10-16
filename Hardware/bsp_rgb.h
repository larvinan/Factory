#ifndef __BSP_RGB_H
#define __BSP_RGB_H

#include "stm32f10x.h"



/************************** RGB 连接引脚定义 ********************************/
/* 三个独立宏，方便任意改接其它 GPIO。
 * 当前默认接法：R→PB0，G→PB1，B→PB5（与项目其它占用引脚无冲突）
 */
#define      RGB_R_GPIO_PORT                     GPIOB
#define      RGB_R_GPIO_CLK                      RCC_APB2Periph_GPIOB
#define      RGB_R_GPIO_PIN                      GPIO_Pin_0

#define      RGB_G_GPIO_PORT                     GPIOB
#define      RGB_G_GPIO_CLK                      RCC_APB2Periph_GPIOB
#define      RGB_G_GPIO_PIN                      GPIO_Pin_1

#define      RGB_B_GPIO_PORT                     GPIOB
#define      RGB_B_GPIO_CLK                      RCC_APB2Periph_GPIOB
#define      RGB_B_GPIO_PIN                      GPIO_Pin_5

/************************** RGB 极性配置 ************************************/
/* 1 = 共阳极（控制端拉低点亮，市面多数 RGB 模块为此种）
 * 0 = 共阴极（控制端拉高点亮）
 * 接线确定后改这一处即可，不需要动下面任何函数
 */
#define      RGB_COMMON_ANODE                    1



/************************** RGB 颜色枚举 ************************************/
typedef enum
{
	RGB_BLACK  = 0,   /* 全灭                       */
	RGB_RED    = 1,   /* 红 —— 报警                 */
	RGB_GREEN  = 2,   /* 绿 —— 正常                 */
	RGB_BLUE   = 3,   /* 蓝                         */
	RGB_YELLOW = 4,   /* 黄(红+绿) —— 警告过渡      */
	RGB_CYAN   = 5,   /* 青(绿+蓝)                  */
	RGB_PURPLE = 6,   /* 紫(红+蓝)                  */
	RGB_WHITE  = 7    /* 白(全亮)                   */
} RGB_Color;



/************************** RGB 函数声明 ***********************************/
void                     RGB_Init                            ( void );
void                     RGB_SetColor                        ( RGB_Color color );
void                     RGB_Off                             ( void );



#endif /* __BSP_RGB_H */
