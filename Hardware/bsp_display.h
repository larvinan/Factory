#ifndef __BSP_DISPLAY_H
#define __BSP_DISPLAY_H

#include "stm32f10x.h"
#include "bsp_dht11.h"
#include "bsp_mq5.h"
#include "bsp_mq2.h"
#include "bsp_ldr.h"
#include "bsp_rgb.h"



/************************** 显示参数修改入口 ********************************/
/* 切页间隔(ms)：每过这么长时间切换到下一页 */
#define      DISPLAY_PAGE_SWITCH_MS              3000u

#define      DISPLAY_PAGE_COUNT                    2u    /* 页数：环境页 + 状态页 */



/************************** 应用全局状态(供 Display 读取显示) ****************/
typedef struct
{
	DHT11_Data_TypeDef  dht11;       /* 温湿度                    */
	MQ5_Data_TypeDef    mq5;         /* MQ5 可燃气体              */
	MQ2_Data_TypeDef    mq2;         /* MQ2 烟雾                  */
	LDR_Data_TypeDef    ldr;         /* 光敏 ADC + 光弱标志         */
	uint8_t             pir;         /* 人体检测 1/0               */
	uint8_t             light_on;    /* 继电器(灯)状态 1/0         */
	RGB_Color           rgb_color;   /* 当前 RGB 颜色              */
	uint16_t            count;       /* 计数模块 RAM 当前值         */
	uint16_t            stock;       /* Flash 缓存中的库存值        */
} App_State_t;



/************************** Display 函数声明 ******************************/
void                     Display_Init                       ( void );
void                     Display_TickUpdate                 ( uint16_t loop_ms, const App_State_t * state );



#endif /* __BSP_DISPLAY_H */
