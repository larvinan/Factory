#!/bin/bash
# ============================================================================
# rk_build.sh  —— 在 RK3568(OpenHarmony / Linux) 上编译 rk_uplink.c
#
# 两种使用方式：
#   A) 直接在 RK3568 板载系统上编译（最简单，如果板上有 gcc + libmosquitto-dev + libcjson-dev）
#      拷贝本脚本和 rk_uplink.c 到板上任意目录，执行：
#          chmod +x rk_build.sh && ./rk_build.sh
#
#   B) 用 OpenHarmony SDK 交叉编译（推荐）
#      把 NDK 或 SDK 的 clang 加到 PATH，并改下面 CC/CFLAGS/LDFLAGS 的路径。
# ============================================================================

set -e

# ======= 编译选项（按需修改） =======
# A) 板载 GCC：
CC=${CC:-gcc}
CFLAGS_EXTRA=""
LDFLAGS_EXTRA=""

# B) 交叉编译(示例，按需取消注释并改路径)：
# export PATH=/opt/openharmony/native/llvm/bin:$PATH
# CC=aarch64-unknown-linux-musl-clang
# CFLAGS_EXTRA="--target=aarch64-linux-ohos -I/opt/openharmony/usr/include"
# LDFLAGS_EXTRA="-L/opt/openharmony/usr/lib -lstdc++"

# ======= 开始编译 =======
echo "[build] CC=$CC"
${CC} -O2 -Wall ${CFLAGS_EXTRA} \
    -o rk_uplink rk_uplink.c \
    -lmosquitto -lcjson -lpthread ${LDFLAGS_EXTRA}

echo "[OK] 生成可执行文件: ./rk_uplink"
echo ""
echo "运行前需要确认："
echo "  1. RK3568 与 STM32 串口接线正确（见 rk_uplink.c 顶部说明）"
echo "  2. OneNET 三要素已经填到 rk_uplink.c 的 ONENET_* 宏里"
echo "  3. 串口设备节点可用：chmod 666 /dev/ttyS2 或加 udev 规则"
echo ""
echo "运行：./rk_uplink     （后台：nohup ./rk_uplink > uplink.log 2>&1 &）"
echo "本地 UDP 命令口：nc -u 127.0.0.1 18888  粘贴 JSON 即可直接命令 STM32"
