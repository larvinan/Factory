# 交叉编译器
CROSS_COMPILE ?= aarch64-linux-gnu-
CC := $(CROSS_COMPILE)gcc

SRC_ROOT := src
INC_ROOT := inc
BIN_DIR  := bin
TARGET   := $(BIN_DIR)/factory_main

# 递归扫描所有子目录的.c源码
SRCS := $(shell find $(SRC_ROOT) -name "*.c")
# 递归收集所有头文件目录
INC_DIRS := $(shell find $(INC_ROOT) -type d)

CFLAGS   += $(addprefix -I,$(INC_DIRS)) -Wall -O2 -static
OH_DEST  ?= /data

all: $(TARGET)

$(TARGET): $(SRCS)
	mkdir -p $(BIN_DIR)
	$(CC) $(SRCS) $(CFLAGS) -o $@

clean:
	rm -rf $(BIN_DIR)

# ============ 串口测试独立目标 ============
TEST_SERIAL := $(BIN_DIR)/rk_serial_test

test_serial: $(TEST_SERIAL)

$(TEST_SERIAL): test/rk_serial_test.c
	mkdir -p $(BIN_DIR)
	$(CC) $< -Wall -O2 -static -o $@

# ============ MQTT 上云目标（零第三方依赖）============
TEST_UPLINK := $(BIN_DIR)/rk_uplink

test_uplink: $(TEST_UPLINK)

$(TEST_UPLINK): test/rk_uplink.c
	mkdir -p $(BIN_DIR)
	$(CC) $< -Wall -O2 -static -o $@ -lpthread

# ============ USB 摄像头抓拍上传目标（零第三方依赖，V4L2+socket）============
TEST_CAMERA := $(BIN_DIR)/rk_camera

test_camera: $(TEST_CAMERA)

$(TEST_CAMERA): test/rk_camera.c
	mkdir -p $(BIN_DIR)
	$(CC) $< -Wall -O2 -static -o $@

push_camera: test_camera
	hdc file send $(TEST_CAMERA) $(OH_DEST)/
	hdc shell chmod 755 $(OH_DEST)/rk_camera
	@echo "推送完成！运行：hdc shell su -c /data/rk_camera"

run_camera: push_camera
	hdc shell su -c /data/rk_camera

push_test: test_serial
	hdc file send $(TEST_SERIAL) $(OH_DEST)/
	hdc shell chmod 755 $(OH_DEST)/rk_serial_test
	@echo "推送完成！运行：hdc shell su -c /data/rk_serial_test"

push_uplink: test_uplink
	hdc file send $(TEST_UPLINK) $(OH_DEST)/
	hdc shell chmod 755 $(OH_DEST)/rk_uplink
	@echo "推送完成！运行：hdc shell su -c /data/rk_uplink"

run_test: push_test
	hdc shell su -c /data/rk_serial_test

run_uplink: push_uplink
	hdc shell su -c /data/rk_uplink

push: all
	hdc file send $(TARGET) $(OH_DEST)/
	hdc shell chmod 755 $(OH_DEST)/factory_main
	@echo "推送完成！运行：hdc shell su -c /data/factory_main"

run: push
	hdc shell su -c /data/factory_main

.PHONY: all clean push run test_serial push_test run_test test_uplink push_uplink run_uplink test_camera push_camera run_camera
