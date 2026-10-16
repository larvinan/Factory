# 工厂环境监测与智能照明系统

> 基于 STM32F103C8T6 + RK3568 真实硬件的工厂安全生产系统，覆盖「环境感知 → 气体/火灾预警 → 智能照明 → 产品计数库存 → AI 视觉安全监控」完整链路，含 **STM32 固件**、**RK3568 网关程序** 与 **PC 端 broker / 后端服务**。

![STM32F103](https://img.shields.io/badge/STM32-F103C8T6-03234B) ![Keil](https://img.shields.io/badge/Keil-MDK--ARM-1E7FCB) ![RK3568](https://img.shields.io/badge/RK3568-OpenHarmony-orange) ![MQTT](https://img.shields.io/badge/MQTT-3.1.1-660066) ![YOLOv8](https://img.shields.io/badge/YOLOv8-ultralytics-red)

---

## ✨ 功能特性

| 模块 | 能力 |
|---|---|
| 🌡 环境监测 | 温度 / 湿度（DHT11）、可燃气（MQ5）、烟雾（MQ2）、光照（LDR），2 秒一帧采集上传 |
| 🚨 气体三档报警 | 绿 → 黄 → 红三档判定，红色伴随蜂鸣器滴答，RGB 灯 + 蜂鸣器自动联动 |
| 💡 智能照明 | 有人（PIR）且光线弱（LDR）→ 继电器自动开灯；无人或光强自动关灯 |
| 📦 计数与库存 | 光电门每遮断计 1 件，每 100 件自动写入 Flash，**掉电不丢**，支持远程改写 |
| 🎛 远程手动控制 | 前端下发继电器 / RGB（7 色）/ 蜂鸣器 / 库存改写，手动状态保持 30 秒后自动恢复 |
| 🪖 视觉安全监控 | USB 摄像头每 3 秒抓拍，后端 YOLO 自动检测**安全帽佩戴**，未戴自动告警 |
| 🖥 本地显示 | OLED 128×64 双页轮播（环境页 / 状态页），每 3 秒切换 |
| 🔌 串口上云 | STM32 二进制帧（`AA … BB`）→ RK3568 解帧为 JSON → MQTT 上报后端 |

---

## 🏗 系统架构

```
STM32F103C8T6 ──(TTL 串口 115200, USART3 ↔ ttyS3)──▶ RK3568 ──(MQTT 1883)──▶ 后端 PC
 传感器采集/执行器            串口解帧 → JSON / 摄像头抓拍            mosquitto broker
                                                                      ├─ Java 后端（入库/告警/前端接口）
                                                                      └─ Python YOLO（安全帽检测 :8001）
```

| 层 | 硬件 / 软件 | 职责 |
|---|---|---|
| 采集执行层 | STM32F103C8T6 + SPL 标准外设库 | DHT11 温湿度、MQ5 可燃气、MQ2 烟雾、LDR 光照、PIR 人体；RGB / 蜂鸣器报警、继电器照明、光电门计数入库、OLED 显示 |
| 网关层 | RK3568（OpenHarmony） | `rk_uplink` 串口数据转 MQTT JSON；`rk_camera` USB 摄像头抓拍转 MQTT 二进制帧 |
| 应用层 | 后端 PC | mosquitto broker + Java 后端（入库 / 告警 / 前端接口）+ Python YOLO 安全帽检测 |

详见 [02_技术文档.md](02_技术文档.md)。

---

## 🚀 快速开始

### 环境要求

Keil µVision5（MDK-ARM，STM32F103 器件包）｜ ST-Link V2 ｜ WSL Ubuntu 22.04 + `aarch64-linux-gnu-gcc` ｜ hdc（OpenHarmony SDK）｜ mosquitto 2.1.2 ｜ Python 3.11（ultralytics + torch + opencv）

### 编译与烧录

**① STM32 固件**（Keil 打开 `Project.uvprojx`）：

```
Rebuild → ST-Link 烧录（接线与标定见 04_使用手册 §2）
```

**② RK3568 程序**（在 WSL Ubuntu 里交叉编译，详见 04_使用手册 §10）：

```bash
cd rk3568
make test_uplink     # → bin/rk_uplink    传感器网关
make test_camera     # → bin/rk_camera    摄像头网关
```

```bat
:: Windows cmd 里推送（WSL 里没有 hdc）
hdc file send bin\rk_uplink /data/  && hdc shell chmod 755 /data/rk_uplink
:: RK3568 重启后先联网（双击根目录 连接JAY.bat 亦可）
hdc shell sh /data/connect_jay.sh
:: 运行
hdc shell su -c /data/rk_uplink
```

### 启动成功标志

| 检查点 | 正常表现 |
|---|---|
| 终端1 `rk_uplink` | `[mqtt] CONNECT ok` + `subscribed`，每 2 秒一条 `[snapshot] {...}` |
| 终端2 `rk_camera` | `[mqtt] connected ok`，每 3 秒一条 `[mqtt] published xxxx bytes` |
| 终端3 后端 | 每 2 秒收传感器 JSON；约每 4 秒打印 `📸 YOLO检测: x人(合规:x 违规:x)` |
| OLED | 两页每 3 秒轮换显示 |
| 前端网页 | 数据实时刷新、视频流有画面、控制按钮生效 |

---

## 📁 目录结构

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
├── 连接JAY.bat               # RK3568 重启后一键联网（Windows 双击即用）
├── 01_开发文档.md            # 开发文档（需求/环境/流程/模块记录/迭代计划）
├── 02_技术文档.md            # 技术文档（架构/接线总表/协议/关键实现/启动说明）
├── 03_测试文档.md            # 测试文档（用例矩阵/步骤/结果/遗留问题）
├── 04_使用手册.md            # 使用手册（面向值班人员：开机/操作/排障）
└── MQTT数据格式.md           # MQTT 上下行接口与数据格式
```

> **分支说明**：`main` 分支为硬件侧（STM32 固件 + RK3568 网关 + 项目文档）；前后端平台（Web 前端 / 支付宝小程序 / Spring Boot 后端 / YOLO 服务）位于 **`frontend-backend`** 分支的 `factory_pro/` 目录。

---

## 🌐 网络参数（当前环境）

| 项 | 值 |
|---|---|
| WiFi SSID | `JAY` |
| MQTT Broker | `10.153.135.142:1883`（后端 PC，匿名） |
| RK3568 静态 IP | `10.153.135.150/24` |
| 串口 | RK `/dev/ttyS3`，115200 8N1；STM32 PB10/PB11 交叉接线 + 共地 |
| 摄像头节点 | RK `/dev/video14`（自动扫描 video0~15 兜底） |
| 数据帧格式 | HEAD `0xAA` / TAIL `0xBB`，checksum = sum(type + len + payload) & 0xFF |
| MQTT Topic | 上行 `factory/sensor/data`、`fg/+/camera`；下行 `factory/device/cmd` |

> IP 随 DHCP 变动时，改 `rk3568/test/rk_uplink.c`、`rk3568/test/rk_camera.c` 的 `MQTT_HOST`、以及板上 `/data/connect_jay.sh` 顶部 `BACKEND_IP` 后重编译推送。建议路由器做 IP/MAC 绑定。

---

## 📚 文档

| 文档 | 内容 |
|---|---|
| [01_开发文档.md](01_开发文档.md) | 项目概述、需求分析、开发环境、开发流程、模块开发记录、迭代计划 |
| [02_技术文档.md](02_技术文档.md) | 系统架构、硬件接线总表、软件分层、核心协议、关键实现、参数修改入口 |
| [03_测试文档.md](03_测试文档.md) | 测试环境、用例矩阵、测试步骤、已通过/未通过记录、遗留问题 |
| [04_使用手册.md](04_使用手册.md) | 面向值班人员：开机流程、日常操作、快速自检、故障排查、维护 |
| [MQTT数据格式.md](MQTT数据格式.md) | 硬件通信协议（上行字段 / 下行命令 / 业务阈值） |

---

## 🧭 日常使用速查

| 场景 | 操作 |
|---|---|
| 每天开工 | 启动 mosquitto + 后端 + YOLO → STM32 上电 → RK 重启则双击 `连接JAY.bat` → 运行 `/data/rk_uplink`、`/data/rk_camera` |
| 收工 | 前端 / rk_camera / rk_uplink 依次 Ctrl+C → STM32 断电 → 停后端与 broker |
| 看气体是否超标 | 观察 RGB 灯色与蜂鸣器：< 1000/400 ppm 绿；1000~2000 / 400~900 黄；> 2000 / >900 红 + 滴答 |
| 手动控制 | 前端点「开灯 / 变 RGB / 关蜂鸣器 / 改库存」，**保持 30 秒**后自动恢复 |
| 库存核查 | OLED 页 1 的 `Stock` 为 Flash 持久值，掉电不丢；自动模式每 100 件落盘 |
| 摄像头自测 | `hdc shell /data/rk_camera snap` → 照片存 `/data/test.jpg`，`hdc file recv` 拉回查看 |
| 串口自检 | 电脑串口助手 115200 8N1 + HEX，每 2 秒应见一帧 `AA 05 14 … BB` |
| 排查连不上 broker | `ping 10.153.135.142`；确认 mosquitto.conf 有 `listener 1883 0.0.0.0` + `allow_anonymous true`，防火墙放行 1883 |

---

## 📄 License

仅供学习与内部使用。
