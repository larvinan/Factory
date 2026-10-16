#include "bsp_display.h"
#include "OLED.h"
#include <stdio.h>


/* 当前显示页索引 */
static uint8_t  s_current_page      = 0;
/* 当前页已展示时间(ms)，达到阈值后切页 */
static uint16_t s_page_elapsed_ms   = 0;
/* 显示文本缓冲区(每行最多 16 字符+结束符) */
static char     s_buf[24];



/*
 * 函数名：Display_RGB_Name
 * 描述  ：把 RGB_Color 枚举转成可读字符串(3 字母缩写，节省 OLED 空间)
 */
static const char * Display_RGB_Name ( RGB_Color c )
{
	switch ( c )
	{
		case RGB_RED:    return "RED";
		case RGB_GREEN:  return "GRN";
		case RGB_BLUE:   return "BLU";
		case RGB_YELLOW: return "YEL";
		case RGB_CYAN:   return "CYN";
		case RGB_PURPLE: return "PUR";
		case RGB_WHITE:  return "WHT";
		default:         return "OFF";
	}
}


/*
 * 函数名：Display_Page0_Env
 * 描述  ：环境监测页 —— DHT11 + MQ5 + MQ2 + 计数
 */
static void Display_Page0_Env ( const App_State_t * s )
{
	sprintf ( s_buf, "T:%d.%d H:%d%%   ",
	          s->dht11.temp_int, s->dht11.temp_deci, s->dht11.humi_int );
	OLED_ShowString ( 0, 0,  s_buf, OLED_8X16 );

	sprintf ( s_buf, "Gas:%dppm   ", s->mq5.ppm );
	OLED_ShowString ( 0, 16, s_buf, OLED_8X16 );

	sprintf ( s_buf, "Smk:%dppm   ", s->mq2.ppm );
	OLED_ShowString ( 0, 32, s_buf, OLED_8X16 );

	sprintf ( s_buf, "Count:%d   ", s->count );
	OLED_ShowString ( 0, 48, s_buf, OLED_8X16 );
}


/*
 * 函数名：Display_Page1_State
 * 描述  ：设备状态页 —— PIR + LDR + 继电器 + RGB + 蜂鸣器
 */
static void Display_Page1_State ( const App_State_t * s )
{
	sprintf ( s_buf, "PIR:%d LDR:%d   ",
	          s->pir, s->ldr.adc_value );
	OLED_ShowString ( 0, 0,  s_buf, OLED_8X16 );

	sprintf ( s_buf, "Light:%s   ", s->light_on ? "ON " : "OFF" );
	OLED_ShowString ( 0, 16, s_buf, OLED_8X16 );

	sprintf ( s_buf, "RGB:%s   ", Display_RGB_Name ( s->rgb_color ) );
	OLED_ShowString ( 0, 32, s_buf, OLED_8X16 );

	sprintf ( s_buf, "Stock:%d   ", s->stock );
	OLED_ShowString ( 0, 48, s_buf, OLED_8X16 );
}


/**
  * @brief  显示模块初始化，重置页索引和计时器
  * @param  无
  * @retval 无
  */
void Display_Init ( void )
{
	s_current_page    = 0;
	s_page_elapsed_ms = 0;
}


/**
  * @brief  显示更新：按设定间隔切换页面并刷新 OLED
  *         非阻塞，可直接放在主循环里
  * @param  loop_ms：本次主循环耗时(ms)，用于推进计时
  * @param  state ：应用状态指针，包含要显示的全部数据
  * @retval 无
  */
void Display_TickUpdate ( uint16_t loop_ms, const App_State_t * state )
{
	if ( state == NULL ) return;

	s_page_elapsed_ms += loop_ms;
	if ( s_page_elapsed_ms >= DISPLAY_PAGE_SWITCH_MS )
	{
		s_page_elapsed_ms = 0;
		s_current_page = (uint8_t)( ( s_current_page + 1 ) % DISPLAY_PAGE_COUNT );
		OLED_Clear ();   /* 切页前清屏，避免上一页残留 */
	}

	switch ( s_current_page )
	{
		case 0:  Display_Page0_Env   ( state ); break;
		case 1:  Display_Page1_State ( state ); break;
		default: Display_Page0_Env   ( state ); break;
	}

	OLED_Update ();
}


/*************************************END OF FILE******************************/
