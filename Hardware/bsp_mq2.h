#ifndef __MQ2_H
#define	__MQ2_H
#include <stddef.h>


#include "stm32f10x.h"



/************************** MQ2 连接引脚定义 ********************************/
/* MQ2 烟雾传感器 AO 接到 ADC1 通道 2 (PA2)。
 * 与 MQ5(ADC1_CH0/PA0) 共用 ADC1，每次读取前会自动切换通道，互不干扰。
 * 改接其它通道只需修改下面三处宏及通道号。
 */
#define      MQ2_GPIO_CLK                       RCC_APB2Periph_GPIOA
#define      MQ2_GPIO_PORT                      GPIOA
#define      MQ2_GPIO_PIN                        GPIO_Pin_2

#define      MQ2_ADC                            ADC1
#define      MQ2_ADC_CLK                        RCC_APB2Periph_ADC1
#define      MQ2_ADC_CHANNEL                     ADC_Channel_2

/************************** MQ2 电气与标定参数 ******************************/
#define      MQ2_VREF_MV                        3300u    /* 参考电压 3.3V (mV)        */
#define      MQ2_ADC_RESOLUTION                 4096u    /* 12 位 ADC 满量程          */
#define      MQ2_SAMPLE_COUNT                    10u     /* 单次读数平均次数，滤除抖动 */
#define      MQ2_CAL_SAMPLE_COUNT                50u     /* 校准时的采样次数，越长越稳 */
#define      MQ2_LOAD_RES_KOHM                   10.0f    /* 板载负载电阻 RL (kΩ)       */

/* 干净空气下的 Rs 标定值，第一次使用请运行 MQ2_Calibrate_R0() 得到真实值，
 * 再把打印出来的数值替换到这里，之后便不再需要重复校准（只要传感器没更换）。
 * datasheet 里清洁空气 Rs/R0 ≈ 1，所以默认 R0 = 清洁空气下的 Rs。
 */
#define      MQ2_RO_CLEAN_AIR                    10.0f    /* <—— 校准后改这里 */

/* 烟雾浓度估算曲线: ppm = MQ2_SMOKE_A * (Rs/R0) ^ MQ2_SMOKE_B
 * 注：示例参数取自 datasheet 典型曲线(对烟雾)，不同个体/环境有差异，
 * 正式使用前请用「已知浓度标气」按 MQ2_Calibrate_Curve() 两点拟合法重新标定。
 */
#define      MQ2_SMOKE_A                         600.0f   /* <—— 曲线校准后改这里 */
#define      MQ2_SMOKE_B                         -2.0f    /* <—— 曲线校准后改这里 */



/************************** MQ2 数据类型定义 ********************************/
typedef struct
{
	uint16_t  adc_value;     /* 原始 ADC 值 0~4095                  */
	uint16_t  voltage_mv;    /* 传感器输出电压 (mV)                 */
	float     rs_kohm;       /* 传感器内阻 Rs (kΩ)                 */
	float     ratio;        /* Rs/R0 比值，越小表示气体浓度越高    */
	uint16_t  ppm;          /* 估算烟雾浓度 (ppm)，需标定后才准确  */
	uint8_t   level;        /* 气体等级 0~100，便于直观显示        */
} MQ2_Data_TypeDef;



/************************** MQ2 函数声明 ***********************************/
void                     MQ2_Init                           ( void );
uint16_t                 MQ2_Read_ADC                       ( void );
uint8_t                  MQ2_Read_Data                       ( MQ2_Data_TypeDef * MQ2_Data );

/* —— 校准相关 —— */
float                    MQ2_Calibrate_R0                   ( void );
void                     MQ2_Calibrate_Curve                ( float ratio1, float ppm1,
                                                               float ratio2, float ppm2,
                                                               float * out_A,  float * out_B );
void                     MQ2_Print_Info                     ( MQ2_Data_TypeDef * d );



#endif /* __MQ2_H */
