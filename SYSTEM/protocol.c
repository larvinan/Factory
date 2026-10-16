#include "protocol.h"
#include <stddef.h>
/**
 * @brief  计算校验和，用于数据校验，保证传输可靠
 * @param  data：待计算的数据首地址
 * @param  len：数据长度
 * @retval 累加后的校验和
 */
uint8_t calc_checksum(uint8_t *data, uint8_t len)
{
    uint8_t sum = 0;
    for(int i=0; i<len; i++)
    {
        sum += data[i]; // 所有字节累加
    }
    return sum;
}

/**
 * @brief  组包，把Frame结构体打包成字节数组，用于串口发送
 * @param  frame：待打包的帧结构体
 * @param  out_buf：输出字节缓存
 * @retval 返回打包完成总字节长度，小于0代表失败
 */
int pack_frame(Frame_t *frame, uint8_t *out_buf)
{
    // 空指针判断、长度超限判断，防护程序崩溃
    if(frame == NULL || out_buf == NULL || frame->len > MAX_FRAME_LEN)
        return -1;

    uint16_t idx = 0;
    out_buf[idx++] = frame->head;        // 存入帧头
    out_buf[idx++] = frame->data_type;   // 存入数据类型
    out_buf[idx++] = frame->len;         // 存入负载长度

    memcpy(&out_buf[idx], frame->payload, frame->len); // 拷贝传感器数据
    idx += frame->len;

    // 校验范围：data_type + len + payload，帧头帧尾不参与校验（和RK保持一致）
    uint8_t temp[128];
    uint8_t sum_len = 2 + frame->len;
    temp[0] = frame->data_type;
    temp[1] = frame->len;
    memcpy(&temp[2], frame->payload, frame->len);

    out_buf[idx++] = calc_checksum(temp, sum_len); // 存入校验和
    out_buf[idx++] = frame->tail;                  // 存入帧尾
    return idx; // 返回总包长
}

/**
 * @brief  解包，串口收到字节流解析成Frame结构体
 * @param  in_buf：接收的原始字节缓存
 * @param  buf_len：收到数据总长度
 * @param  frame：解析完成输出的帧结构体
 * @retval 0成功，负数代表不同类型错误
 */
int unpack_frame(uint8_t *in_buf, int buf_len, Frame_t *frame)
{
    // 基础合法性判断
    if(in_buf == NULL || frame == NULL || buf_len < 5)
        return -1;
    // 判断帧头帧尾是否正确
    if(in_buf[0] != FRAME_HEAD || in_buf[buf_len-1] != FRAME_TAIL)
        return -2;

    frame->head = in_buf[0];
    frame->data_type = in_buf[1];
    frame->len = in_buf[2];

    // 判断负载长度是否合法，防止越界
    if(frame->len > MAX_FRAME_LEN || (3 + frame->len + 2) > buf_len)
        return -3;

    memcpy(frame->payload, &in_buf[3], frame->len); // 拷贝有效数据

    // 重新计算校验和对比，判断数据传输是否出错
    uint8_t temp[128];
    uint8_t sum_len = 2 + frame->len;
    temp[0] = frame->data_type;
    temp[1] = frame->len;
    memcpy(&temp[2], frame->payload, frame->len);

    uint8_t check = calc_checksum(temp, sum_len);
    if(check != in_buf[3 + frame->len])
        return -4; // 校验失败，数据损坏

    frame->tail = in_buf[3 + frame->len + 1];
    return 0; // 解析成功
}

