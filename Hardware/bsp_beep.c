#include "bsp_beep.h"


/* 滴答状态机的内部状态 */
static uint16_t s_on_ms      = 200;   /* 单次响铃时长             */
static uint16_t s_off_ms     = 200;   /* 单次静音时长             */
static uint16_t s_elapsed_ms = 0;     /* 当前相位已累计时间       */
static uint8_t  s_tick_active = 0;   /* 是否处于滴答模式 1/0     */
static uint8_t  s_beeping     = 0;    /* 当前是否正在响铃 1/0     */



/*
 * 函数名：BEEP_Write
 * 描述  ：按触发电平配置写响/灭，兼容高/低电平触发
 * 输入  ：on：1=响 0=灭
 * 输出  ：无
 */
static void BEEP_Write ( uint8_t on )
{
#if ( BEEP_ACTIVE_HIGH == 1 )
	if ( on )  GPIO_SetBits   ( BEEP_GPIO_PORT, BEEP_GPIO_PIN );
	else       GPIO_ResetBits ( BEEP_GPIO_PORT, BEEP_GPIO_PIN );
#else
	if ( on )  GPIO_ResetBits ( BEEP_GPIO_PORT, BEEP_GPIO_PIN );
	else       GPIO_SetBits   ( BEEP_GPIO_PORT, BEEP_GPIO_PIN );
#endif
}


/**
  * @brief  蜂鸣器初始化，配置 GPIO 为推挽输出并默认静音
  * @param  无
  * @retval 无
  */
void BEEP_Init ( void )
{
	GPIO_InitTypeDef GPIO_InitStructure;

	RCC_APB2PeriphClockCmd ( BEEP_GPIO_CLK, ENABLE );

	GPIO_InitStructure.GPIO_Pin   = BEEP_GPIO_PIN;
	GPIO_InitStructure.GPIO_Mode  = GPIO_Mode_Out_PP;
	GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
	GPIO_Init ( BEEP_GPIO_PORT, &GPIO_InitStructure );

	BEEP_Off ();
}


/**
  * @brief  立即响铃（手动模式，不影响滴答状态机）
  * @param  无
  * @retval 无
  */
void BEEP_On ( void )
{
	BEEP_Write ( 1 );
	s_beeping = 1;
}


/**
  * @brief  立即静音（手动模式，不影响滴答状态机）
  * @param  无
  * @retval 无
  */
void BEEP_Off ( void )
{
	BEEP_Write ( 0 );
	s_beeping = 0;
}


/**
  * @brief  启动非阻塞滴答鸣叫。重复调用同节奏会被忽略，避免节奏被打断
  * @param  on_ms  ：单次响铃时长(ms)
  * @param  off_ms ：单次静音时长(ms)
  * @retval 无
  */
void BEEP_TickStart ( uint16_t on_ms, uint16_t off_ms )
{
	/* 已在该节奏下则不重置，保持节奏稳定 */
	if ( s_tick_active && s_on_ms == on_ms && s_off_ms == off_ms )
		return;

	s_on_ms       = on_ms;
	s_off_ms      = off_ms;
	s_elapsed_ms  = 0;
	s_tick_active = 1;
	BEEP_On ();   /* 立刻进入响铃相位 */
}


/**
  * @brief  停止滴答模式并静音
  * @param  无
  * @retval 无
  */
void BEEP_TickStop ( void )
{
	s_tick_active = 0;
	s_elapsed_ms  = 0;
	BEEP_Off ();
}


/**
  * @brief  推进滴答状态机，主循环每轮调用一次，传入本次循环耗时
  *         非阻塞，不会卡住 OLED/传感器读取
  * @param  loop_period_ms：本次主循环耗时(ms)
  * @retval 无
  */
void BEEP_TickUpdate ( uint16_t loop_period_ms )
{
	if ( !s_tick_active ) return;

	s_elapsed_ms += loop_period_ms;

	if ( s_beeping && s_elapsed_ms >= s_on_ms )
	{
		BEEP_Off ();
		s_elapsed_ms = 0;
	}
	else if ( !s_beeping && s_elapsed_ms >= s_off_ms )
	{
		BEEP_On ();
		s_elapsed_ms = 0;
	}
}


/**
  * @brief  查询当前是否处于滴答模式
  * @param  无
  * @retval 1 处于滴答模式，0 未启动
  */
uint8_t BEEP_IsActive ( void )
{
	return s_tick_active;
}


/*************************************END OF FILE******************************/
