#include "bsp_mq2.h"
#include "usart.h"
#include <math.h>
#include <stdio.h>
#include <string.h>


static void              MQ2_ADC_GPIO_Config                ( void );
static void              MQ2_ADC_Mode_Config                 ( void );
static float             MQ2_Compute_Rs_By_ADC               ( uint16_t adc );



 /**
  * @brief  MQ2 初始化函数，配置 ADC 用到的 GPIO 与 ADC 外设
  * @param  无
  * @retval 无
  */
void MQ2_Init ( void )
{
	MQ2_ADC_GPIO_Config ();
	MQ2_ADC_Mode_Config ();
}


/*
 * 函数名：MQ2_ADC_GPIO_Config
 * 描述  ：配置 MQ2 AO 引脚为模拟输入模式
 * 输入  ：无
 * 输出  ：无
 */
static void MQ2_ADC_GPIO_Config ( void )
{
	GPIO_InitTypeDef GPIO_InitStructure;

	/*开启 GPIO 时钟*/
	RCC_APB2PeriphClockCmd ( MQ2_GPIO_CLK, ENABLE );

	/*选择 MQ2 AO 引脚*/
	GPIO_InitStructure.GPIO_Pin = MQ2_GPIO_PIN;

	/*设置为模拟输入，ADC 专用模式*/
	GPIO_InitStructure.GPIO_Mode = GPIO_Mode_AIN;

	GPIO_Init ( MQ2_GPIO_PORT, &GPIO_InitStructure );
}


/*
 * 函数名：MQ2_ADC_Mode_Config
 * 描述  ：配置 ADC1 为独立模式、单通道单次转换、软件触发
 *         与 MQ5 共用 ADC1，每次读取前会重新指定本通道，不冲突
 * 输入  ：无
 * 输出  ：无
 */
static void MQ2_ADC_Mode_Config ( void )
{
	ADC_InitTypeDef ADC_InitStructure;

	/*开启 ADC 时钟(若已由 MQ5 开启则不影响)*/
	RCC_APB2PeriphClockCmd ( MQ2_ADC_CLK, ENABLE );

	ADC_DeInit ( MQ2_ADC );

	ADC_InitStructure.ADC_Mode               = ADC_Mode_Independent;
	ADC_InitStructure.ADC_ScanConvMode       = DISABLE;
	ADC_InitStructure.ADC_ContinuousConvMode = DISABLE;
	ADC_InitStructure.ADC_ExternalTrigConv   = ADC_ExternalTrigConv_None;
	ADC_InitStructure.ADC_DataAlign          = ADC_DataAlign_Right;
	ADC_InitStructure.ADC_NbrOfChannel       = 1;
	ADC_Init ( MQ2_ADC, &ADC_InitStructure );

	ADC_RegularChannelConfig ( MQ2_ADC, MQ2_ADC_CHANNEL, 1, ADC_SampleTime_55Cycles5 );

	ADC_Cmd ( MQ2_ADC, ENABLE );

	/*ADC 自校准(若已由 MQ5 校准则重复校一次也无害)*/
	ADC_ResetCalibration ( MQ2_ADC );
	while ( ADC_GetResetCalibrationStatus ( MQ2_ADC ) );
	ADC_StartCalibration ( MQ2_ADC );
	while ( ADC_GetCalibrationStatus ( MQ2_ADC ) );
}


/**
  * @brief  读取 MQ2 的 ADC 原始值，多次采样取平均以减小抖动
  *         与 MQ5 共用 ADC1，每次读取前先切回本通道
  * @param  无
  * @retval 12 位 ADC 值，范围 0~4095
  */
uint16_t MQ2_Read_ADC ( void )
{
	uint32_t sum = 0;
	uint16_t i;

	/*多 ADC 通道共存：每次读取前切回 MQ2 通道，避免被其它通道抢占*/
	ADC_RegularChannelConfig ( MQ2_ADC, MQ2_ADC_CHANNEL, 1, ADC_SampleTime_55Cycles5 );

	for ( i = 0; i < MQ2_SAMPLE_COUNT; i++ )
	{
		ADC_SoftwareStartConvCmd ( MQ2_ADC, ENABLE );
		while ( !ADC_GetFlagStatus ( MQ2_ADC, ADC_FLAG_EOC ) );
		sum += ADC_GetConversionValue ( MQ2_ADC );
	}

	return (uint16_t)( sum / MQ2_SAMPLE_COUNT );
}


/**
  * @brief  根据 ADC 原始值反算 Rs (内部使用，同时供校准函数复用)
  * @param  adc：ADC 原始值
  * @retval Rs 单位 kΩ
  */
static float MQ2_Compute_Rs_By_ADC ( uint16_t adc )
{
	float vout = (float)adc * (float)MQ2_VREF_MV / (float)MQ2_ADC_RESOLUTION;
	if ( vout < 1.0f ) vout = 1.0f;
	return MQ2_LOAD_RES_KOHM * ( (float)MQ2_VREF_MV - vout ) / vout;
}


/**
  * @brief  读取 MQ2 全部数据并填入结构体，便于上层显示与上报
  * @param  MQ2_Data：输出数据结构体指针
  * @retval 1 成功，0 失败(参数非法)
  */
uint8_t MQ2_Read_Data ( MQ2_Data_TypeDef * MQ2_Data )
{
	if ( MQ2_Data == NULL )
		return 0;

	/*1. 原始 ADC 与电压*/
	uint16_t adc   = MQ2_Read_ADC ();
	float    vout  = (float)adc * (float)MQ2_VREF_MV / (float)MQ2_ADC_RESOLUTION;

	MQ2_Data->adc_value   = adc;
	MQ2_Data->voltage_mv  = (uint16_t)vout;

	/*2. 传感器内阻 Rs = RL * (Vref - Vout) / Vout (kΩ)*/
	MQ2_Data->rs_kohm = MQ2_Compute_Rs_By_ADC ( adc );

	/*3. Rs/R0 比值，干净空气约等于 1，浓度越高越小；做下限钳位*/
	float ratio = MQ2_Data->rs_kohm / MQ2_RO_CLEAN_AIR;
	if ( ratio < 1e-4f ) ratio = 1e-4f;
	MQ2_Data->ratio = ratio;

	/*4. ppm 估算: ppm = A * (Rs/R0) ^ B，参数需标定，仅供参考*/
	float ppm_f = MQ2_SMOKE_A * powf ( ratio, MQ2_SMOKE_B );
	if ( ppm_f < 0.0f || isnan(ppm_f) || isinf(ppm_f) ) ppm_f = 0.0f;
	if ( ppm_f > 9999.0f ) ppm_f = 9999.0f;
	MQ2_Data->ppm = (uint16_t)ppm_f;

	/*5. 等级 0~100：把 ratio 映射为浓度百分比，便于直观显示*/
	int lvl = (int)( ( 1.0f - ratio ) * 100.0f );
	if ( lvl < 0 ) lvl = 0;
	if ( lvl > 100 ) lvl = 100;
	MQ2_Data->level = (uint8_t)lvl;

	return 1;
}


/**
  * @brief  校准 R0：在「干净空气 + 预热至少 24h 稳定」状态下调用一次，
  *         得到当前传感器的真实 R0，再把结果写回 MQ2_RO_CLEAN_AIR 宏。
  * @param  无
  * @retval 计算得到的 R0 (kΩ)
  */
float MQ2_Calibrate_R0 ( void )
{
	uint16_t i;
	float    rs_sum = 0.0f;

	for ( i = 0; i < MQ2_CAL_SAMPLE_COUNT; i++ )
	{
		uint16_t adc = MQ2_Read_ADC ();
		rs_sum += MQ2_Compute_Rs_By_ADC ( adc );
	}

	float rs_avg = rs_sum / (float)MQ2_CAL_SAMPLE_COUNT;
	float r0 = rs_avg;

	{
		char buf[128];
		int  len;
		len = sprintf ( buf, "[MQ2]Calibrate R0 done: Rs_air=%.3f kOhm -> R0=%.3f kOhm\r\n"
		                     "       请把 bsp_mq2.h 中 MQ2_RO_CLEAN_AIR 改为 %.3ff\r\n",
		                rs_avg, r0, r0 );
		usart_send_data ( (uint8_t*)buf, (uint16_t)len );
	}

	return r0;
}


/**
  * @brief  两点法拟合浓度曲线参数 A/B，满足 ppm = A * (Rs/R0)^B
  * @param  ratio1：第一点 Rs/R0
  * @param  ppm1  ：第一点对应 ppm
  * @param  ratio2：第二点 Rs/R0
  * @param  ppm2  ：第二点对应 ppm
  * @param  out_A ：输出 A
  * @param  out_B ：输出 B
  * @retval 无
  */
void MQ2_Calibrate_Curve ( float ratio1, float ppm1,
                           float ratio2, float ppm2,
                           float * out_A,  float * out_B )
{
	float B, A;

	float log_r1 = logf ( ratio1 );
	float log_r2 = logf ( ratio2 );
	float log_p1 = logf ( ppm1 );
	float log_p2 = logf ( ppm2 );

	float denom = ( log_r2 - log_r1 );
	if ( denom > -1e-6f && denom < 1e-6f ) denom = 1e-6f;

	B = ( log_p2 - log_p1 ) / denom;
	A = expf ( log_p1 - B * log_r1 );

	if ( out_A != NULL ) *out_A = A;
	if ( out_B != NULL ) *out_B = B;

	{
		char buf[128];
		int  len;
		len = sprintf ( buf, "[MQ2]Curve fit: A=%.3f   B=%.4f\r\n"
		                     "       请把 MQ2_SMOKE_A 改为 %.3ff  ，MQ2_SMOKE_B 改为 %.4ff\r\n",
		                A, B, A, B );
		usart_send_data ( (uint8_t*)buf, (uint16_t)len );
	}
}


/**
  * @brief  把 MQ2 全部字段通过串口打印出来，方便校准与调试
  * @param  d：MQ2 数据指针
  * @retval 无
  */
void MQ2_Print_Info ( MQ2_Data_TypeDef * d )
{
	char buf[160];
	int  len;
	if ( d == NULL ) return;
	len = sprintf ( buf,
		"[MQ2] ADC=%4u  Vout=%4umV  Rs=%.2fkOhm  Rs/R0=%.3f  ppm=%4u  level=%3u\r\n",
		d->adc_value, d->voltage_mv, d->rs_kohm, d->ratio, d->ppm, d->level );
	usart_send_data ( (uint8_t*)buf, (uint16_t)len );
}


/*************************************END OF FILE******************************/
