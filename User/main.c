#include "bsp_mq5.h"
#include "bsp_mq2.h"
#include "bsp_rgb.h"
#include "bsp_beep.h"
#include "bsp_pir.h"
#include "bsp_ldr.h"
#include "bsp_relay.h"
#include "bsp_eeprom.h"
#include "bsp_display.h"
#include "bsp_uplink.h"
#include "CountSensor.h"
#include "stdint.h"
#include <stdio.h>
#include "stm32f10x.h"
#include "delay.h"
#include "OLED.h"
#include "bsp_dht11.h"
#include "usart.h"

/* ================= 参数修改入口 ================= */
/* —— 气体报警阈值 (ppm) —— MQ5 与 MQ2 任一超标即报警 */
#define MQ5_ALARM_HIGH         2000u    /* MQ5 可燃气体红灯阈值：>2000 红灯+滴答       */
#define MQ2_ALARM_HIGH         900u     /* MQ2 烟雾红灯阈值：>900 红灯+滴答            */
#define MQ5_WARN_LOW           1000u    /* MQ5 黄灯警告下限：1000~2000 黄灯过渡(静音)  */
#define MQ2_WARN_LOW           400u     /* MQ2 黄灯警告下限：400~900 黄灯过渡(静音)    */

/* —— 滴答节奏 (ms) —— */
#define BEEP_TICK_ON_MS        200u
#define BEEP_TICK_OFF_MS        200u

/* —— 主循环周期 (ms)，用于驱动非阻塞滴答与切页 —— */
#define MAIN_LOOP_MS            100u

/* —— MQ5/MQ2 R0 校准模式开关：1=校准模式，0=正常运行模式 —— */
#define MODE_CALIB_R0            0

/* 其它可调参数(无需在此处修改):
 *   - 计数保存间隔:    Hardware/CountSensor.h::COUNT_SAVE_INTERVAL (默认 100)
 *   - OLED 切页间隔:   Hardware/bsp_display.h::DISPLAY_PAGE_SWITCH_MS (默认 3000ms)
 *   - LDR 光弱阈值:    Hardware/bsp_ldr.h::LDR_DARK_THRESHOLD (默认 2000)
 *   - MQ5/MQ2 R0/曲线: Hardware/bsp_mq5.h / bsp_mq2.h 对应宏
 * ================================================== */

/* 全局应用状态：main 写入，Display 读取显示 */
App_State_t g_app;


void system_init(void)
{
	delay_init();
	OLED_Init();
	EE_Init();
	DHT11_Init();
	MQ5_Init();
	MQ2_Init();
	RGB_Init();
	BEEP_Init();
	PIR_Init();
	LDR_Init();
	RELAY_Init();
	CountSensor_Init();
	Display_Init();
	Uplink_Init();
	usart1_init(115200);
}

/**
  * @brief  气体报警状态机（三档）：
  *         任一气体 > ALARM_HIGH      → 红灯 + 滴答报警
  *         任一气体 ALARM~WARN 之间   → 黄灯过渡警告，静音
  *         两气体都 < WARN_LOW        → 绿灯，静音
  *         结果写入 g_app.rgb_color 供 Display 显示
  * @param  mq5_ppm, mq2_ppm：当前两种气体浓度
  * @retval 无
  */
void GasAlarm_Update(uint16_t mq5_ppm, uint16_t mq2_ppm)
{
	/* 手动保持期：前端声光控制优先，本状态机让位（超时后自动恢复） */
	if (Uplink_AlarmOverrideActive())
		return;

	if (mq5_ppm > MQ5_ALARM_HIGH || mq2_ppm > MQ2_ALARM_HIGH)
	{
		RGB_SetColor(RGB_RED);
		BEEP_TickStart(BEEP_TICK_ON_MS, BEEP_TICK_OFF_MS);
		g_app.rgb_color = RGB_RED;
	}
	else if (mq5_ppm > MQ5_WARN_LOW || mq2_ppm > MQ2_WARN_LOW)
	{
		RGB_SetColor(RGB_YELLOW);
		BEEP_TickStop();
		g_app.rgb_color = RGB_YELLOW;
	}
	else
	{
		RGB_SetColor(RGB_GREEN);
		BEEP_TickStop();
		g_app.rgb_color = RGB_GREEN;
	}
}

/**
  * @brief  智能照明状态机：人存在 + 光弱 → 继电器吸合；否则释放
  *         结果写入 g_app.pir / ldr / light_on 供 Display 显示
  * @retval 无
  */
void LightCtrl_Update(void)
{
	g_app.pir = PIR_Detect();
	LDR_Read_Data(&g_app.ldr);

	/* 手动保持期：前端继电器控制优先，自动照明让位
	 * light_on 已在命令执行时由 bsp_uplink 同步进 g_app */
	if (Uplink_LightOverrideActive())
		return;

	g_app.light_on = (g_app.pir && g_app.ldr.is_dark) ? 1 : 0;
	if (g_app.light_on) RELAY_On();
	else                RELAY_Off();
}

#if MODE_CALIB_R0
/* ====== 校准模式：洁净空气下烧录一次，分别得到 MQ5/MQ2 的 R0 ====== */
int main(void)
{
	system_init();
	OLED_Clear();

	/* 依次校准 MQ5、MQ2，串口会打印结果 */
	float r5 = MQ5_Calibrate_R0();
	float r2 = MQ2_Calibrate_R0();

	char buf[24];
	sprintf(buf, "MQ5 R0=%.2f", r5);
	OLED_ShowString(0, 0,  buf,   OLED_8X16);
	sprintf(buf, "MQ2 R0=%.2f", r2);
	OLED_ShowString(0, 16, buf,   OLED_8X16);
	OLED_ShowString(0, 32, "Write to bsp_mq5.h", OLED_6X8);
	OLED_ShowString(0, 44, "& bsp_mq2.h",         OLED_6X8);
	OLED_Update();

	while (1) {}
}
#else
/* ====== 正常运行模式 ====== */
int main(void)
{
	system_init();
	OLED_Clear();
	RGB_SetColor(RGB_GREEN);
	g_app.rgb_color = RGB_GREEN;
	//CountSensor_RewriteFlashStock(0);//需要清理库存时使用
	
	while (1)
	{
		/* —— 1. 采集所有传感器 —— */
		/* DHT11 读失败时保留上次值 */
		DHT11_Data_TypeDef dht11_tmp;
		if (DHT11_Read_TempAndHumidity(&dht11_tmp) == 1)
			g_app.dht11 = dht11_tmp;

		MQ5_Read_Data(&g_app.mq5);
		MQ2_Read_Data(&g_app.mq2);
		g_app.count = CountSensor_Get();
		g_app.stock = CountSensor_GetFlashStock();

		/* —— 2. 业务状态机 —— */
		GasAlarm_Update(g_app.mq5.ppm, g_app.mq2.ppm);
		LightCtrl_Update();

		/* —— 3. 显示：自动切页，无阻塞 —— */
		Display_TickUpdate(MAIN_LOOP_MS, &g_app);

		/* —— 4. 计数持久化：按间隔写 Flash —— */
		CountSensor_TickSave();

		/* —— 5. 蜂鸣器非阻塞推进 —— */
		BEEP_TickUpdate(MAIN_LOOP_MS);

		/* —— 6. 有线上传（TTL 串口 → RK3568）+ 处理 RK 下发命令 —— */
		Uplink_TickUpdate(MAIN_LOOP_MS, &g_app);

		delay_ms(MAIN_LOOP_MS);
	}
}
#endif
