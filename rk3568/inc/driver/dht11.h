#ifndef __DHT11_H__
#define __DHT11_H__

#include <stdint.h>

// 配置DHT11使用的GPIO编号（对应 jwsioc_gpio0）
#define DHT_GPIO_NUM    0

typedef struct {
    uint8_t hum_int;    // 湿度整数
    uint8_t hum_dec;    // 湿度小数(DHT11永远为0)
    uint8_t temp_int;   // 温度整数
    uint8_t temp_dec;   // 温度小数(DHT11永远为0)
    uint8_t checksum;   // 校验和
} Dht11Data;

/**
 * @brief 初始化DHT11 GPIO（专用节点，无需export）
 * @return 0成功，负数失败
 */
int dht11_init(void);

/**
 * @brief 读取一次DHT11数据（内置3次重试）
 * @param data 输出温湿度结构体
 * @return 0读取成功，负数失败
 */
int dht11_read(Dht11Data *data);

#endif
