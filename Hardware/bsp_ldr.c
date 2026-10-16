#include "bsp_ldr.h"


static void              LDR_GPIO_Config                    ( void );
static void              LDR_ADC_Config                     ( void );



/**
  * @brief  光敏电阻初始化，配置 GPIO 为模拟输入 + ADC2 独立模式
  * @param  无
  * @retval 无
  */
void LDR_Init ( void )
{
	LDR_GPIO_Config ();
	LDR_ADC_Config  ();
}


/*
 * 函数名：LDR_GPIO_Config
 * 描述  ：配置 LDR AO 引脚为模拟输入
 */
static void LDR_GPIO_Config ( void )
{
	GPIO_InitTypeDef GPIO_InitStructure;

	RCC_APB2PeriphClockCmd ( LDR_GPIO_CLK, ENABLE );

	GPIO_InitStructure.GPIO_Pin  = LDR_GPIO_PIN;
	GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AIN;
	GPIO_Init ( LDR_GPIO_PORT, &GPIO_InitStructure );
}


/*
 * 函数名：LDR_ADC_Config
 * 描述  ：配置 ADC2 为独立模式、单通道单次转换、软件触发并自校准
 *        使用 ADC2 与 MQ5 的 ADC1 隔离，无需通道切换
 */
static void LDR_ADC_Config ( void )
{
	ADC_InitTypeDef ADC_InitStructure;

	RCC_APB2PeriphClockCmd ( LDR_ADC_CLK, ENABLE );

	ADC_DeInit ( LDR_ADC );

	ADC_InitStructure.ADC_Mode               = ADC_Mode_Independent;
	ADC_InitStructure.ADC_ScanConvMode       = DISABLE;
	ADC_InitStructure.ADC_ContinuousConvMode = DISABLE;
	ADC_InitStructure.ADC_ExternalTrigConv   = ADC_ExternalTrigConv_None;
	ADC_InitStructure.ADC_DataAlign          = ADC_DataAlign_Right;
	ADC_InitStructure.ADC_NbrOfChannel       = 1;
	ADC_Init ( LDR_ADC, &ADC_InitStructure );

	ADC_RegularChannelConfig ( LDR_ADC, LDR_ADC_CHANNEL, 1, ADC_SampleTime_55Cycles5 );

	ADC_Cmd ( LDR_ADC, ENABLE );

	/* ADC 自校准，提高精度 */
	ADC_ResetCalibration ( LDR_ADC );
	while ( ADC_GetResetCalibrationStatus ( LDR_ADC ) );
	ADC_StartCalibration ( LDR_ADC );
	while ( ADC_GetCalibrationStatus ( LDR_ADC ) );
}


/**
  * @brief  读取 LDR 的 ADC 原始值，多次采样取平均以减小抖动
  * @param  无
  * @retval 12 位 ADC 值，范围 0~4095
  */
uint16_t LDR_Read_ADC ( void )
{
	uint32_t sum = 0;
	uint16_t i;

	for ( i = 0; i < LDR_SAMPLE_COUNT; i++ )
	{
		ADC_SoftwareStartConvCmd ( LDR_ADC, ENABLE );
		while ( !ADC_GetFlagStatus ( LDR_ADC, ADC_FLAG_EOC ) );
		sum += ADC_GetConversionValue ( LDR_ADC );
	}

	return (uint16_t)( sum / LDR_SAMPLE_COUNT );
}


/**
  * @brief  读取 LDR 全部数据并填入结构体
  * @param  data：输出数据结构体指针
  * @retval 1 成功，0 失败(参数非法)
  */
uint8_t LDR_Read_Data ( LDR_Data_TypeDef * data )
{
	if ( data == NULL )
		return 0;

	uint16_t adc = LDR_Read_ADC ();
	data->adc_value  = adc;
	data->voltage_mv = (uint16_t)( (float)adc * (float)LDR_VREF_MV / (float)LDR_ADC_RESOLUTION );

#if ( LDR_DARK_WHEN_HIGH == 1 )
	data->is_dark = ( adc >= LDR_DARK_THRESHOLD ) ? 1 : 0;
#else
	data->is_dark = ( adc <= LDR_DARK_THRESHOLD ) ? 1 : 0;
#endif

	return 1;
}


/**
  * @brief  快速判断当前是否为光弱环境（仅返回 0/1）
  * @param  无
  * @retval 1 光弱，0 光强
  */
uint8_t LDR_IsDark ( void )
{
	LDR_Data_TypeDef data;
	if ( LDR_Read_Data ( &data ) )
		return data.is_dark;
	return 0;
}


/*************************************END OF FILE******************************/
