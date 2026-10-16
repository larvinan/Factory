#include "bsp_pir.h"


/**
  * @brief  人体红外传感器初始化，配置 OUT 引脚为上拉输入
  * @param  无
  * @retval 无
  */
void PIR_Init ( void )
{
	GPIO_InitTypeDef GPIO_InitStructure;

	RCC_APB2PeriphClockCmd ( PIR_GPIO_CLK, ENABLE );

	GPIO_InitStructure.GPIO_Pin   = PIR_GPIO_PIN;
	GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_IPU;        /* 上拉输入，空闲时稳定为低 */
	GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
	GPIO_Init ( PIR_GPIO_PORT, &GPIO_InitStructure );
}


/**
  * @brief  检测是否有人体活动
  * @param  无
  * @retval 1 = 检测到人体；0 = 无人
  */
uint8_t PIR_Detect ( void )
{
	return GPIO_ReadInputDataBit ( PIR_GPIO_PORT, PIR_GPIO_PIN ) == Bit_SET ? 0 : 1;
}


/*************************************END OF FILE******************************/
