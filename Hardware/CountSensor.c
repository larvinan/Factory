#include "stm32f10x.h"                  // Device header
#include "CountSensor.h"
#include "bsp_eeprom.h"



/* Flash 中保存的数据布局：1 字节 magic + 1 字节保留 + 2 字节计数(大端) */
#pragma pack(push, 1)
typedef struct
{
	uint8_t  magic;
	uint8_t  reserved;
	uint16_t count;
} CountEE_t;
#pragma pack(pop)



static volatile uint16_t CountSensor_Count    = 0;   /* 当前计数值          */
static volatile uint16_t CountSensor_Unsaved  = 0;   /* 自上次保存以来的增量 */



/**
  * 函    数：把当前计数写入 Flash(整页擦写)
  * 返 回 值：1 成功 0 失败
  */
static uint8_t CountSensor_SaveToFlash ( void )
{
	CountEE_t data;
	data.magic    = COUNT_EE_MAGIC;
	data.reserved = 0;
	data.count    = CountSensor_Count;
	return EE_WriteBlock ( &data, sizeof(data) );
}


/**
  * 函    数：计数传感器初始化
  *         配置 PB14 外部中断下降沿触发 + 上电从 Flash 恢复计数
  * 参    数：无
  * 返 回 值：无
  */
void CountSensor_Init(void)
{
	/*开启时钟*/
	RCC_APB2PeriphClockCmd(RCC_APB2Periph_GPIOB, ENABLE);
	RCC_APB2PeriphClockCmd(RCC_APB2Periph_AFIO, ENABLE);

	/*GPIO初始化*/
	GPIO_InitTypeDef GPIO_InitStructure;
	GPIO_InitStructure.GPIO_Mode = GPIO_Mode_IPU;
	GPIO_InitStructure.GPIO_Pin = GPIO_Pin_14;
	GPIO_InitStructure.GPIO_Speed = GPIO_Speed_50MHz;
	GPIO_Init(GPIOB, &GPIO_InitStructure);

	/*AFIO选择中断引脚*/
	GPIO_EXTILineConfig(GPIO_PortSourceGPIOB, GPIO_PinSource14);

	/*EXTI初始化*/
	EXTI_InitTypeDef EXTI_InitStructure;
	EXTI_InitStructure.EXTI_Line = EXTI_Line14;
	EXTI_InitStructure.EXTI_LineCmd = ENABLE;
	EXTI_InitStructure.EXTI_Mode = EXTI_Mode_Interrupt;
	EXTI_InitStructure.EXTI_Trigger = EXTI_Trigger_Falling;
	EXTI_Init(&EXTI_InitStructure);

	/*NVIC中断分组(整个工程仅调一次，多模块共用分组2)*/
	NVIC_PriorityGroupConfig(NVIC_PriorityGroup_2);

	NVIC_InitTypeDef NVIC_InitStructure;
	NVIC_InitStructure.NVIC_IRQChannel = EXTI15_10_IRQn;
	NVIC_InitStructure.NVIC_IRQChannelCmd = ENABLE;
	NVIC_InitStructure.NVIC_IRQChannelPreemptionPriority = 1;
	NVIC_InitStructure.NVIC_IRQChannelSubPriority = 1;
	NVIC_Init(&NVIC_InitStructure);

	/* 上电从 Flash 恢复计数 */
	CountEE_t data;
	EE_ReadBlock ( &data, sizeof(data) );
	if ( data.magic == COUNT_EE_MAGIC )
		CountSensor_Count = data.count;
	else
		CountSensor_Count = 0;

	CountSensor_Unsaved = 0;
}

/**
  * 函    数：获取当前计数值
  * 参    数：无
  * 返 回 值：0~65535
  */
uint16_t CountSensor_Get(void)
{
	return CountSensor_Count;
}

/**
  * 函    数：手动设置计数值(并标记待保存)
  * 参    数：val 新计数值
  * 返 回 值：无
  */
void CountSensor_Set(uint16_t val)
{
	CountSensor_Count = val;
	CountSensor_Unsaved = COUNT_SAVE_INTERVAL;   /* 触发下次 TickSave 立即写 Flash */
}

/**
  * 函    数：清零计数(并标记待保存)
  * 参    数：无
  * 返 回 值：无
  */
void CountSensor_Reset(void)
{
	CountSensor_Set(0);
}

/**
  * 函    数：周期性保存(主循环调用)
  *         当自上次保存以来的增量 >= COUNT_SAVE_INTERVAL 时，写一次 Flash
  *         避免每次中断都擦写 Flash，延长 Flash 寿命
  * 参    数：无
  * 返 回 值：无
  */
void CountSensor_TickSave(void)
{
	if ( CountSensor_Unsaved >= COUNT_SAVE_INTERVAL )
	{
		if ( CountSensor_SaveToFlash() )
			CountSensor_Unsaved = 0;
	}
}

/**
  * 函    数：强制立即保存(例如关机/异常前调用)
  * 参    数：无
  * 返 回 值：无
  */
void CountSensor_ForceSave(void)
{
	CountSensor_SaveToFlash ();
	CountSensor_Unsaved = 0;
}

/**
  * 函    数：手动改写 Flash 缓存中的库存值（选在 CountSensor 中，库存=计数）
  *         更新 RAM 计数并立即擦写整页 Flash，不计入间隔
  * 参    数：val 新库存值（0~65535）
  * 返 回 值：无
  */
void CountSensor_RewriteFlashStock(uint16_t val)
{
	CountSensor_Count = val;
	CountSensor_SaveToFlash();
	CountSensor_Unsaved = 0;
}

/**
  * 函    数：只从 Flash 读取库存缓存值（不读 RAM，用于显示/校验，magic 不对返回 0）
  * 参    数：无
  * 返 回 值：库存值
  */
uint16_t CountSensor_GetFlashStock(void)
{
	CountEE_t data;
	EE_ReadBlock(&data, sizeof(data));
	if (data.magic == COUNT_EE_MAGIC)
		return data.count;
	return 0;
}

/**
  * 函    数：EXTI15_10 外部中断函数(下降沿触发，PB14)
  *         自增计数并累计未保存次数；不在此处写 Flash，避免阻塞中断
  */
void EXTI15_10_IRQHandler(void)
{
	if (EXTI_GetITStatus(EXTI_Line14) == SET)
	{
		if (GPIO_ReadInputDataBit(GPIOB, GPIO_Pin_14) == 0)
		{
			CountSensor_Count ++;
			CountSensor_Unsaved ++;
		}
		EXTI_ClearITPendingBit(EXTI_Line14);
	}
}
