# 工厂环境监测与智能照明系统

面向小型工厂/仓库的安全生产场景：**环境实时监测 + 气体火灾预警 + 智能照明 + 产品计数库存 + 视觉安全监控（安全帽检测）**。

## 系统组成

```
STM32F103C8T6 ──(TTL 串口 115200, USART3↔ttyS3)── RK3568 ──(MQTT 1883)── 后端 PC
  传感器采集/执行器            串口解帧 → JSON / 摄像头抓拍        broker + Java 后端 + YOLO
```

| 层 | 硬件 / 软件 | 职责 |
|---|---|---|
| 采集执行层 | STM32F103C8T6 + SPL 标准库 | DHT11 温湿度、MQ5 可燃气、MQ2 烟雾、LDR 光照、PIR 人体；RGB/蜂鸣器报警、继电器照明、光电门计数入库、OLED 显示 |
| 网关层 | RK3568（OpenHarmony） | `rk_uplink` 串口数据转 MQTT JSON；`rk_camera` USB 摄像头抓拍转 MQTT 二进制帧 |
| 应用层 | 后端 PC | mosquitto broker + Java 后端（入库/告警/前端接口）+ Python YOLO 安全帽检测 |

## 目录结构

```
.
├── Hardware/                 # STM32 硬件驱动（bsp_mq5/mq2/dht11/pir/ldr/rgb/beep/relay/eeprom/display、OLED、CountSensor）
├── SYSTEM/                   # 协议与系统基础（protocol 帧、bsp_uplink 上云封装、usart/delay/sys）
├── User/main.c               # 应用层：system_init + 业务状态机 + 主循环 Tick 调度
├── Start/  Library/          # 启动文件 + CMSIS / STM32F10x 标准外设库
├── Project.uvprojx           # Keil µVision5 工程（Target 1 · STM32F103C8）
├── rk3568/                   # RK3568 端（在 WSL Ubuntu 里交叉编译）
│   ├── makefile              # make test_uplink / test_camera / test_serial
│   ├── test/                 # rk_uplink.c / rk_camera.c / rk_serial_test.c
│   ├── src/  inc/            # RK 原有 factory_main + dht11 骨架（独立）
│   ├── rk_build.sh           # 板载 SDK 编译脚本（可选，OneNET 旧方案）
│   └── rk_verify.py          # 串口链路验证脚本（需 pyserial）
├── pc_frame_receiver.py      # PC 端 HTTP 收图调试脚本（纯标准库，8080）
├── 连接JAY.bat               # RK 重启后一键联网（Windows 双击即用）
├── 01_开发文档.md            # 开发文档（需求/环境/流程/模块记录/迭代计划）
├── 02_技术文档.md            # 技术文档（架构/接线总表/协议/关键实现/启动说明）
├── 03_测试文档.md            # 测试文档（用例矩阵/步骤/结果/遗留问题）
├── 04_使用手册.md            # 使用手册（面向值班人员：开机/操作/排障）
└── MQTT数据格式.md           # MQTT 上下行接口与数据格式
```

## 网络参数（当前环境）

| 项 | 值 |
|---|---|
| WiFi SSID | `JAY` |
| MQTT Broker | `10.153.135.142:1883`（后端 PC，匿名） |
| RK3568 静态 IP | `10.153.135.150/24` |
| 串口 | RK `/dev/ttyS3`，115200 8N1；STM32 PB10/PB11 交叉接线 + 共地 |
| 摄像头节点 | RK `/dev/video14`（自动扫描 video0~15 兜底） |

> IP 随 DHCP 变动时，改 `rk3568/test/rk_uplink.c`、`rk3568/test/rk_camera.c` 的 `MQTT_HOST`、以及板上 `/data/connect_jay.sh` 顶部 `BACKEND_IP` 后重编译推送。建议路由器做 IP/MAC 绑定。

## 快速开始

**STM32**：Keil 打开 `Project.uvprojx` → Rebuild → ST-Link 烧录（详见 04_使用手册 §2）。

**RK3568**（在 WSL Ubuntu 交叉编译，详见 04_使用手册 §10）：

```bash
cd rk3568
make test_uplink     # → bin/rk_uplink
make test_camera     # → bin/rk_camera
```

```bat
:: Windows cmd 里推送（WSL 里没有 hdc）
hdc file send bin\rk_uplink /data/  && hdc shell chmod 755 /data/rk_uplink
:: RK 重启后先联网
hdc shell sh /data/connect_jay.sh
:: 运行
hdc shell su -c /data/rk_uplink
```

> 首次使用前请先读 [04_使用手册.md](04_使用手册.md)；开发原理见 [02_技术文档.md](02_技术文档.md)。
