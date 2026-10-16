#ifndef __BSP_LDR_H
#define __BSP_LDR_H

#include "stm32f10x.h"
#include <stddef.h>


/************************** LDR 连接引脚定义 ********************************/
/* 光敏电阻模块 AO 接 ADC2 通道 1 (PA1)。
 * 用 ADC2 独立外设，与 MQ5 用的 ADC1 互不干扰，避免通道切换冲突。
 * 改接其它通道只需修改下面三处宏。
 */
#define      LDR_GPIO_PORT                       GPIOA
#define      LDR_GPIO_CLK                        RCC_APB2Periph_GPIOA
#define      LDR_GPIO_PIN                        GPIO_Pin_1

#define      LDR_ADC                             ADC2
#define      LDR_ADC_CLK                         RCC_APB2Periph_ADC2
#define      LDR_ADC_CHANNEL                     ADC_Channel_1

/************************** LDR 电气与判定参数 ******************************/
#define      LDR_VREF_MV                         3300u    /* 参考电压 3.3V (mV)        */
#define      LDR_ADC_RESOLUTION                  4096u    /* 12 位 ADC 满量程          */
#define      LDR_SAMPLE_COUNT                    10u      /* 单次读数平均次数，滤除抖动 */

/* "光弱"判定方向：
 *   1 = ADC 越大表示光越弱（典型 LDR+上拉分压：光强时 LDR 阻值小，分压低）
 *   0 = ADC 越大表示光越强（LDR 在分压下方：光强时输出高）
 * 接线后用串口/OLED 观察 ADC 值变化方向，必要时改这一处即可
 */
#define      LDR_DARK_WHEN_HIGH                   1

/* "光弱"判定阈值（ADC 原始值 0~4095）：
 *   若 LDR_DARK_WHEN_HIGH = 1，则 adc >= LDR_DARK_THRESHOLD 判为光弱
 *   若 LDR_DARK_WHEN_HIGH = 0，则 adc <= LDR_DARK_THRESHOLD 判为光弱
 */
#define      LDR_DARK_THRESHOLD                   2500u



/************************** LDR 数据类型定义 ********************************/
typedef struct
{
	uint16_t  adc_value;     /* 原始 ADC 值 0~4095              */
	uint16_t  voltage_mv;    /* AO 端电压 (mV)                  */
	uint8_t   is_dark;       /* 1=光弱 0=光强（已按方向+阈值判断）*/
} LDR_Data_TypeDef;



/************************** LDR 函数声明 ***********************************/
void                     LDR_Init                            ( void );
uint16_t                 LDR_Read_ADC                        ( void );
uint8_t                  LDR_Read_Data                       ( LDR_Data_TypeDef * data );
uint8_t                  LDR_IsDark                          ( void );



#endif /* __BSP_LDR_H */
