#ifndef __COUNT_SENSOR_H
#define __COUNT_SENSOR_H

#include "stm32f10x.h"



/************************** 计数模块参数修改入口 ****************************/
/* 掉电保存间隔(累计触发次数)：每过此数值写一次 Flash，避免频繁擦写损耗寿命 */
#define      COUNT_SAVE_INTERVAL                  100u
/* Flash 中数据有效标志：上电读取时若不等于此值则视为首次使用，从 0 计数 */
#define      COUNT_EE_MAGIC                       0xAAu



/************************** 计数模块函数声明 ********************************/
void                     CountSensor_Init                    ( void );   /* 上电：恢复 Flash 中的计数 */
uint16_t                 CountSensor_Get                     ( void );
void                     CountSensor_Set                     ( uint16_t val );   /* 手动设值，标记待保存 */
void                     CountSensor_Reset                   ( void );            /* 清零，标记待保存 */
void                     CountSensor_TickSave                ( void );            /* 主循环周期调用，按间隔写 Flash */
void                     CountSensor_ForceSave               ( void );            /* 强制立即保存(如关机前) */

/* —— 手动改写 Flash 缓存库存值的通道（选在 CountSensor 中，库存=计数）——
 * 使用方法：在 main 或任意业务代码中调用，会覆盖 RAM 计数 + 立即写 Flash
 * 示例：CountSensor_RewriteFlashStock(500);  // 直接把库存设为 500
 */
void                     CountSensor_RewriteFlashStock       ( uint16_t val );
uint16_t                 CountSensor_GetFlashStock           ( void );            /* 只从 Flash 读取缓存值，不读 RAM（用于显示库存）*/



#endif /* __COUNT_SENSOR_H */
