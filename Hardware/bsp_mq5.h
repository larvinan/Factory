#ifndef __MQ5_H
#define	__MQ5_H
#include <stddef.h>


#include "stm32f10x.h"



/************************** MQ5 连接引脚定义 ********************************/
/* MQ5 为模拟传感器，AO 接到 STM32 的 ADC 通道引脚，默认接 PA0(ADC1_IN0)。
 * 如需改接其它通道，只需修改下面三处宏及 ADC 通道号即可。
 */
#define      MQ5_GPIO_CLK                       RCC_APB2Periph_GPIOA
#define      MQ5_GPIO_PORT                      GPIOA
#define      MQ5_GPIO_PIN                       GPIO_Pin_0

#define      MQ5_ADC                            ADC1
#define      MQ5_ADC_CLK                        RCC_APB2Periph_ADC1
#define      MQ5_ADC_CHANNEL                    ADC_Channel_0

/************************** MQ5 电气与标定参数 ******************************/
#define      MQ5_VREF_MV                        3300u    /* 参考电压 3.3V (mV)        */
#define      MQ5_ADC_RESOLUTION                 4096u    /* 12 位 ADC 满量程          */
#define      MQ5_SAMPLE_COUNT                   10u     /* 单次读数平均次数，滤除抖动 */
#define      MQ5_CAL_SAMPLE_COUNT               50u     /* 校准时的采样次数，越长越稳 */
#define      MQ5_LOAD_RES_KOHM                  10.0f    /* 板载负载电阻 RL (kΩ)       */

/* 干净空气下的 Rs 标定值，第一次使用请运行 MQ5_Calibrate_R0() 得到真实值，
 * 再把打印出来的数值替换到这里，之后便不再需要重复校准（只要传感器没更换）。
 * datasheet 里清洁空气 Rs/R0 ≈ 1，所以默认 R0 = 清洁空气下的 Rs。
 */
#define      MQ5_RO_CLEAN_AIR                   186.0f    /* <—— 校准后改这里 */

/* 气体浓度估算曲线: ppm = MQ5_LPG_A * (Rs/R0) ^ MQ5_LPG_B
 * 注：示例参数取自 datasheet 典型曲线，不同个体/环境有差异，
 * 正式使用前请用「已知浓度标气」按 MQ5_Calibrate_Curve() 两点拟合法重新标定。
 */
#define      MQ5_LPG_A                          200.0f   /* <—— 曲线校准后改这里 */
#define      MQ5_LPG_B                          -2.5f    /* <—— 曲线校准后改这里 */



/************************** MQ5 数据类型定义 ********************************/
typedef struct
{
	uint16_t  adc_value;     /* 原始 ADC 值 0~4095                  */
	uint16_t  voltage_mv;    /* 传感器输出电压 (mV)                 */
	float     rs_kohm;       /* 传感器内阻 Rs (kΩ)                 */
	float     ratio;        /* Rs/R0 比值，越小表示气体浓度越高    */
	uint16_t  ppm;          /* 估算气体浓度 (ppm)，需标定后才准确  */
	uint8_t   level;        /* 气体等级 0~100，便于直观显示        */
} MQ5_Data_TypeDef;



/************************** MQ5 函数声明 ***********************************/
void                     MQ5_Init                           ( void );
uint16_t                 MQ5_Read_ADC                       ( void );
uint8_t                  MQ5_Read_Data                       ( MQ5_Data_TypeDef * MQ5_Data );

/* —— 校准相关 —— */
float                    MQ5_Calibrate_R0                   ( void );
void                     MQ5_Calibrate_Curve                ( float ratio1, float ppm1,
                                                               float ratio2, float ppm2,
                                                               float * out_A,  float * out_B );
void                     MQ5_Print_Info                     ( MQ5_Data_TypeDef * d );



#endif /* __MQ5_H */
