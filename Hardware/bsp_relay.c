#include "bsp_relay.h"


/*
 * 函数名：RELAY_Write
 * 描述  ：按触发电平配置写吸合/释放
 * 输入  ：on：1=吸合 0=释放
 */
static void RELAY_Write ( uint8_t on )
{
#if ( RELAY_ACTIVE_LOW == 1 )
	if ( on )  GPIO_ResetBits ( RELAY_GPIO_PORT, RELAY_GPIO_PIN );
	else       GPIO_SetBits   ( RELAY_GPIO_PORT, RELAY_GPIO_PIN );
#else
	if ( on )  GPIO_SetBits   ( RELAY_GPIO_PORT, RELAY_GPIO_PIN );
	else       GPIO_ResetBits ( RELAY_GPIO_PORT, RELAY_GPIO_PIN );
#endif
}


/**
  * @brief  继电器初始化，配置 IN 引脚为推挽输出并默认释放
  * @param  无
  * @retval 无
  */
void RELAY_Init ( void )
{
	GPIO_InitTypeDef GPIO_InitStructure;

	RCC_APB2PeriphClockCmd ( RELAY_GPIO_CLK, ENABLE );

	GPIO_InitStructure.GPIO_Pin   = RELAY_GPIO_PIN;
	GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_Out_PP;
	GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
	GPIO_Init ( RELAY_GPIO_PORT, &GPIO_InitStructure );

	RELAY_Off ();
}


/**
  * @brief  继电器吸合（灯/外设通电）
  * @param  无
  * @retval 无
  */
void RELAY_On ( void )
{
	RELAY_Write ( 1 );
}


/**
  * @brief  继电器释放（灯/外设断电）
  * @param  无
  * @retval 无
  */
void RELAY_Off ( void )
{
	RELAY_Write ( 0 );
}


/*************************************END OF FILE******************************/
