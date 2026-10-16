#include "bsp_rgb.h"


/*
 * 函数名：RGB_WriteChannel
 * 描述  ：按极性配置把单通道写成"亮"或"灭"，兼容共阳/共阴
 * 输入  ：port/pin：GPIO 引脚；on：1=亮 0=灭
 * 输出  ：无
 */
static void RGB_WriteChannel ( GPIO_TypeDef * port, uint16_t pin, uint8_t on )
{
#if ( RGB_COMMON_ANODE == 1 )
	/* 共阳：点亮需把控制端拉低 */
	if ( on )  GPIO_ResetBits ( port, pin );
	else       GPIO_SetBits   ( port, pin );
#else
	/* 共阴：点亮需把控制端拉高 */
	if ( on )  GPIO_SetBits   ( port, pin );
	else       GPIO_ResetBits ( port, pin );
#endif
}


/*
 * 函数名：RGB_WritePins
 * 描述  ：按 r/g/b 三个 0/1 同时写三路通道
 * 输入  ：r,g,b 各 0 或 1
 * 输出  ：无
 */
static void RGB_WritePins ( uint8_t r, uint8_t g, uint8_t b )
{
	RGB_WriteChannel ( RGB_R_GPIO_PORT, RGB_R_GPIO_PIN, r );
	RGB_WriteChannel ( RGB_G_GPIO_PORT, RGB_G_GPIO_PIN, g );
	RGB_WriteChannel ( RGB_B_GPIO_PORT, RGB_B_GPIO_PIN, b );
}


/**
  * @brief  RGB 初始化，把 R/G/B 三路 GPIO 配置为推挽输出并默认全灭
  * @param  无
  * @retval 无
  */
void RGB_Init ( void )
{
	GPIO_InitTypeDef GPIO_InitStructure;

	/*三路时钟一次开启（都在 GPIOB）*/
	RCC_APB2PeriphClockCmd ( RGB_R_GPIO_CLK | RGB_G_GPIO_CLK | RGB_B_GPIO_CLK, ENABLE );

	GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_Out_PP;
	GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;

	GPIO_InitStructure.GPIO_Pin = RGB_R_GPIO_PIN;
	GPIO_Init ( RGB_R_GPIO_PORT, &GPIO_InitStructure );

	GPIO_InitStructure.GPIO_Pin = RGB_G_GPIO_PIN;
	GPIO_Init ( RGB_G_GPIO_PORT, &GPIO_InitStructure );

	GPIO_InitStructure.GPIO_Pin = RGB_B_GPIO_PIN;
	GPIO_Init ( RGB_B_GPIO_PORT, &GPIO_InitStructure );

	RGB_Off ();
}


/**
  * @brief  设置 RGB 颜色，输入枚举值即可，避免上层关心三路电平
  * @param  color：目标颜色（RGB_BLACK 等同于 RGB_Off）
  * @retval 无
  */
void RGB_SetColor ( RGB_Color color )
{
	switch ( color )
	{
		case RGB_RED:    RGB_WritePins ( 1, 0, 0 ); break;
		case RGB_GREEN:  RGB_WritePins ( 0, 1, 0 ); break;
		case RGB_BLUE:   RGB_WritePins ( 0, 0, 1 ); break;
		case RGB_YELLOW: RGB_WritePins ( 1, 1, 0 ); break;
		case RGB_CYAN:   RGB_WritePins ( 0, 1, 1 ); break;
		case RGB_PURPLE: RGB_WritePins ( 1, 0, 1 ); break;
		case RGB_WHITE:  RGB_WritePins ( 1, 1, 1 ); break;
		case RGB_BLACK:
		default:         RGB_WritePins ( 0, 0, 0 ); break;
	}
}


/**
  * @brief  关闭 RGB（全灭）
  * @param  无
  * @retval 无
  */
void RGB_Off ( void )
{
	RGB_SetColor ( RGB_BLACK );
}


/*************************************END OF FILE******************************/
