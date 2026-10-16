#ifndef __PROTOCOL_H
#define __PROTOCOL_H

#include "stm32f10x.h"

// 帧头、帧尾标记，RK和STM32必须完全一致
#define FRAME_HEAD 0xAA
#define FRAME_TAIL 0xBB
// 单包数据最大长度，根据项目需求调整
#define MAX_FRAME_LEN 64

// 数据包类型枚举，RK、STM32两边定义完全相同，新增传感器在这里添加
typedef enum
{
    DATA_DHT11 = 0x01,    // DHT11温湿度数据
    DATA_GAS = 0x02,      // MQ2、MQ5气体浓度数据
    DATA_COUNT = 0x03,    // 光电货物计数数据
    DATA_ALARM = 0x04,    // 设备故障告警数据
    DATA_CTRL = 0x10      // RK下发控制指令(舵机/风扇/继电器)
} Data_Type;

// 自定义通信帧结构体
typedef struct
{
    uint8_t head;         // 帧头 FRAME_HEAD(0xAA)
    uint8_t data_type;    // 数据类型，对应上面枚举
    uint8_t len;          // 有效负载payload长度
    uint8_t payload[MAX_FRAME_LEN]; // 存放传感器原始数据
    uint8_t check_sum;    // 和校验，防止传输出错
    uint8_t tail;         // 帧尾 FRAME_TAIL(0xBB)
} Frame_t;

uint8_t calc_checksum(uint8_t *data, uint8_t len);  // 计算校验和
int pack_frame(Frame_t *frame, uint8_t *out_buf);   // 组包：结构体转为串口发送字节流
int unpack_frame(uint8_t *in_buf, int buf_len, Frame_t *frame); // 解包：收到的字节流转为结构体

#endif
