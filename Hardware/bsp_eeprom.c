#include "bsp_eeprom.h"
#include "stm32f10x_flash.h"


/**
  * @brief  EEPROM 初始化。当前为空壳，预留扩展(如校验 magic)
  *         真正的写入由 EE_WriteBlock 在调用时擦写整页
  * @param  无
  * @retval 无
  */
void EE_Init ( void )
{
	/* 无需额外初始化：Flash 解锁/擦写都在 EE_WriteBlock 内进行 */
}


/**
  * @brief  从 Flash 末页读取一段数据到 RAM 缓冲区
  * @param  buf：输出缓冲区指针
  * @param  len：读取字节数(最大 EEPROM_PAGE_SIZE)
  * @retval 无
  */
void EE_ReadBlock ( void * buf, uint16_t len )
{
	uint8_t * src;
	uint8_t * dst;
	uint16_t i;

	if ( buf == NULL || len == 0 || len > EEPROM_PAGE_SIZE )
		return;

	src = (uint8_t *)EEPROM_BASE_ADDR;
	dst = (uint8_t *)buf;

	for ( i = 0; i < len; i++ )
		dst[i] = src[i];
}


/**
  * @brief  把一段数据写入 Flash 末页(整页擦除后重新编程)
  *         注意：每次写都会擦除整页，请上层用"间隔保存"策略避免频繁擦写
  * @param  buf：待写入数据指针
  * @param  len：字节数(最大 EEPROM_PAGE_SIZE)
  * @retval 1 成功，0 失败
  */
uint8_t EE_WriteBlock ( const void * buf, uint16_t len )
{
	const uint8_t * src;
	uint32_t addr;
	uint16_t i;

	if ( buf == NULL || len == 0 || len > EEPROM_PAGE_SIZE )
		return 0;

	src = (const uint8_t *)buf;

	FLASH_Unlock ();

	/* 1. 擦除整页 */
	if ( FLASH_ErasePage ( EEPROM_BASE_ADDR ) != FLASH_COMPLETE )
	{
		FLASH_Lock ();
		return 0;
	}

	/* 2. 按 16 位半字编程(STM32F1 Flash 编程最小单位为半字) */
	addr = EEPROM_BASE_ADDR;
	for ( i = 0; i + 1 < len; i += 2 )
	{
		uint16_t half = (uint16_t)src[i] | ( (uint16_t)src[i + 1] << 8 );
		if ( FLASH_ProgramHalfWord ( addr, half ) != FLASH_COMPLETE )
		{
			FLASH_Lock ();
			return 0;
		}
		addr += 2;
	}

	/* 3. 长度为奇数时，最后一个字节补 0xFF 写入半字 */
	if ( i < len )
	{
		uint16_t half = (uint16_t)src[i] | 0xFF00u;
		if ( FLASH_ProgramHalfWord ( addr, half ) != FLASH_COMPLETE )
		{
			FLASH_Lock ();
			return 0;
		}
	}

	FLASH_Lock ();
	return 1;
}


/*************************************END OF FILE******************************/
