#ifndef __BSP_EEPROM_H
#define __BSP_EEPROM_H

#include "stm32f10x.h"
#include <stdint.h>
#include <stddef.h>


/************************** Flash 模拟 EEPROM 配置 **************************/
/* 使用 STM32F103C8T6 内部 Flash 的最后一页(1KB)作为持久存储区
 * - 64KB Flash 末页：0x0800FC00
 * - 若芯片为 128KB 版本(C8T6 实测有时是 128KB)，可改 0x0801FC00
 * - Flash 单页擦写寿命约 1 万次，配合"间隔保存"策略足够用很多年
 */
#define      EEPROM_BASE_ADDR                    0x0800FC00u
#define      EEPROM_PAGE_SIZE                     1024u



/************************** EEPROM 函数声明 ********************************/
void                     EE_Init                             ( void );
void                     EE_ReadBlock                        ( void * buf, uint16_t len );
uint8_t                  EE_WriteBlock                       ( const void * buf, uint16_t len );   /* 1=成功 0=失败 */



#endif /* __BSP_EEPROM_H */
