#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rk_verify.py —— RK3568 端快速验证整条数据链路（不需装任何依赖）

作用：
  1. 打开 /dev/ttyS3，从 STM32 收 protocol.c 定义的 Frame_t 二进制帧
  2. 解析 DATA_SNAPSHOT 帧，得到 14 个传感器/状态字段
  3. 打印成易读 JSON 到控制台

这一步只验证：物理层 + 协议层 + 解析层 是否完全打通
打通后再换 rk_uplink.c 上云（OneNET MQTT + HTTP 后端）

运行：
  python3 rk_verify.py
或
  python rk_verify.py

按 Ctrl+C 退出
"""

import serial
import struct
import sys
import time

# ============ 参数（与 STM32 端一致）============
SERIAL_DEV   = "/dev/ttyS3"
SERIAL_BAUD  = 115200

FRAME_HEAD   = 0xAA
FRAME_TAIL   = 0xBB
MAX_FRAME_LEN = 64
DATA_SNAPSHOT = 0x05

# Snapshot payload 结构（22 字节，与 bsp_uplink.h Uplink_Snapshot_t 一致）
# 格式：<hhHHBBHBBBBHH  （小端）
#   h  temp_x10   int16
#   h  humi_x10   int16
#   H  mq5_ppm     uint16
#   H  mq2_ppm     uint16
#   B  mq5_level   uint8
#   B  mq2_level   uint8
#   H  ldr_adc     uint16
#   B  pir_person  uint8
#   B  light_on    uint8
#   B  rgb_color   uint8
#   B  beep_active uint8
#   H  count       uint16
#   H  stock       uint16
SNAPSHOT_FMT = "<hhHHBBHBBBBHH"
SNAPSHOT_LEN = struct.calcsize(SNAPSHOT_FMT)  # = 22


def calc_checksum(data):
    """与 STM32 protocol.c calc_checksum 一致：累加和 & 0xFF"""
    s = 0
    for b in data:
        s = (s + b) & 0xFF
    return s


def try_extract_frame(buf):
    """从 buf 字节流中尝试抽一帧。
    返回 (frame_bytes, consumed) 或 (None, n) 表示前 n 字节无帧可丢
    """
    n = len(buf)
    if n < 5:
        return None, 0
    i = 0
    while i < n:
        if buf[i] != FRAME_HEAD:
            i += 1
            continue
        if i + 3 > n:
            return None, i  # 不够读 type/len，丢掉前面的非 HEAD
        data_type = buf[i+1]
        dlen = buf[i+2]
        if dlen > MAX_FRAME_LEN:
            i += 1
            continue
        total = 3 + dlen + 2
        if i + total > n:
            return None, i  # 还没收齐
        if buf[i + total - 1] != FRAME_TAIL:
            i += 1
            continue
        # 校验
        chk_src = bytes([data_type, dlen]) + buf[i+3 : i+3+dlen]
        if calc_checksum(chk_src) != buf[i + 3 + dlen]:
            i += 1
            continue
        return buf[i : i + total], i + total
    return None, n


def parse_snapshot(payload):
    """解析 22 字节 payload，返回 dict"""
    if len(payload) != SNAPSHOT_LEN:
        return None
    fields = struct.unpack(SNAPSHOT_FMT, payload)
    return {
        "temp_c":    fields[0] / 10.0,
        "humi_pct":  fields[1] / 10.0,
        "mq5_ppm":   fields[2],
        "mq2_ppm":   fields[3],
        "mq5_level": fields[4],
        "mq2_level": fields[5],
        "ldr_adc":   fields[6],
        "pir":       fields[7],
        "light_on":  fields[8],
        "rgb_color": fields[9],
        "beep":      fields[10],
        "count":     fields[11],
        "stock":     fields[12],
    }


def main():
    print(f"[rk_verify] opening {SERIAL_DEV} @ {SERIAL_BAUD}")
    try:
        ser = serial.Serial(SERIAL_DEV, SERIAL_BAUD, timeout=0.1)
    except Exception as e:
        print(f"[ERROR] 打不开串口: {e}")
        print("可能原因：")
        print("  1) 节点不存在：ls /dev/ttyS*")
        print("  2) 权限不够：sudo chmod 666 /dev/ttyS3")
        print("  3) Python 串口库未装：pip3 install pyserial")
        return 1

    print("[rk_verify] 等待 STM32 数据（每 2s 一帧）...Ctrl+C 退出\n")
    print("-" * 78)

    rx_buf = b""
    last_print_ts = 0
    frame_count = 0

    try:
        while True:
            chunk = ser.read(256)
            if chunk:
                rx_buf += chunk

                while True:
                    frame, consumed = try_extract_frame(rx_buf)
                    rx_buf = rx_buf[consumed:]
                    if frame is None:
                        break

                    data_type = frame[1]
                    dlen = frame[2]
                    payload = frame[3 : 3 + dlen]

                    if data_type == DATA_SNAPSHOT:
                        snap = parse_snapshot(payload)
                        if snap:
                            frame_count += 1
                            ts = time.strftime("%H:%M:%S")
                            print(f"[{ts}] #{frame_count} Snapshot:")
                            print(f"  T={snap['temp_c']:5.1f}°C  H={snap['humi_pct']:5.1f}%")
                            print(f"  MQ5={snap['mq5_ppm']:4d}ppm (lv{snap['mq5_level']})  "
                                  f"MQ2={snap['mq2_ppm']:4d}ppm (lv{snap['mq2_level']})")
                            print(f"  LDR={snap['ldr_adc']:4d}  PIR={snap['pir']}  "
                                  f"Light={'ON' if snap['light_on'] else 'OFF'}  "
                                  f"RGB={snap['rgb_color']}  Beep={snap['beep']}")
                            print(f"  Count={snap['count']:5d}  Stock={snap['stock']:5d}")
                            print("-" * 78)
                    else:
                        print(f"[?] 未知帧 type=0x{data_type:02x} len={dlen}")
            else:
                time.sleep(0.05)
    except KeyboardInterrupt:
        print("\n[rk_verify] 退出")
    finally:
        ser.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
