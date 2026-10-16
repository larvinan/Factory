# FactoryGuard（鸿观智巡）— 智慧工厂安全监测控制平台

## 项目概述

FactoryGuard 是基于 ESP32-CAM 边缘节点的智慧工厂安全监测系统，集成 **8路传感器**、**YOLO视觉AI**（安全帽检测）、**MQTT通信**、**DeepSeek AI助手**，实现工厂环境监测、安全帽合规检测、自动告警联动的完整闭环。

---

## 快速启动

### 环境要求
| 组件 | 版本 | 说明 |
|------|------|------|
| Java | 21+ | 后端运行 |
| MySQL | 8.0+ | 数据存储 |
| Mosquitto | 2.1+ | MQTT Broker |
| Python | 3.11+ | YOLO推理服务 |

### 启动顺序

```bash
# 1. 启动 MySQL（确保服务运行）
# 2. 初始化数据库
mysql -u root -p < backend-java/src/main/resources/init_db.sql

# 3. 启动 Mosquitto（安装后自动运行，无需手动启动）

# 4. 启动 Python YOLO 推理服务 (新终端)
cd esp32_camera_web
python inference_server.py

# 5. 启动 Java 后端 (IDEA 中运行 FactoryGuardApplication)

# 6. 模拟数据测试（无硬件时）
双击 test_send_sensor.bat   # 传感器数据
双击 test_send_camera.bat   # 摄像头图片
```

验证: 浏览器打开 `http://localhost:8000/api/health` → 返回 `{"status":"ok"}`

---

## 架构图

```
ESP32-CAM (硬件)
    │  WiFi STA 模式
    │  MQTT: fg/{device_id}/sensors | camera | status
    ▼
Mosquitto MQTT Broker (localhost:1883)
    │
    ├──────────────┬──────────────────┐
    ▼              ▼                  ▼
Java 后端 (8000)  Python推理(8001)   DeepSeek AI
    │              │                  │
    │  HTTP POST   │ YOLO 安全帽检测   │ 流式问答
    │  图片帧 ────▶│                  │
    │              │                  │
    ▼              ▼                  ▼
MySQL (factoryguard)   WebSocket(前端)   浏览器(流式输出)
```

---

## 完整文件结构及说明

```
web_of_tThings_pro04/
│
├── esp32_camera_web/                          # ⭐ 主项目目录
│   │
│   ├── 📄 项目文档
│   ├── README.md                               # 项目总说明（本文件）
│   ├── API接口文档.md                          # 后端 HTTP API 完整文档
│   ├── Mosquitto使用指南.md                    # Mosquitto MQTT Broker 安装与使用
│   ├── 硬件代码设计文档.md                       # ESP32 固件设计说明（给硬件人员）
│   │
│   ├── 🔧 ESP32 固件
│   ├── factoryguard_esp32.ino                  # ⭐ FactoryGuard 主固件（MQTT+传感器+执行器）
│   ├── esp32_camera_web.ino                    # 独立 WiFi 摄像头固件（HTTP MJPEG流，调试用）
│   │
│   ├── 🐍 Python 推理服务
│   ├── inference_server.py                     # ⭐ YOLO 推理微服务 (端口8001)
│   │
│   ├── ☕ Java 后端
│   ├── backend-java/                           # Spring Boot 后端
│       ├── pom.xml                             # Maven 项目配置
│       └── src/main/
│           ├── resources/
│           │   ├── application.yml              # ⭐ 主配置文件（端口/MySQL/MQTT/DeepSeek）
│           │   ├── init_db.sql                  # ⭐ 数据库建表脚本（6张表+默认数据）
│           │   └── mybatis/mapper/              # MyBatis XML 映射（预留）
│           └── java/com/factoryguard/
│               ├── FactoryGuardApplication.java # Spring Boot 启动入口
│               ├── config/
│               │   ├── CorsConfig.java          # 跨域配置
│               │   └── WebSocketConfig.java     # WebSocket 端点 /ws
│               ├── controller/                  # REST 控制器
│               │   ├── AiController.java        # AI助手（FAQ列表 + 流式对话）
│               │   ├── AlertController.java     # 告警（列表/详情/处理）
│               │   ├── CommandLogController.java# 指令日志查询
│               │   ├── ControlController.java   # 设备控制/统计/健康检查
│               │   ├── DetectionController.java # 检测记录查询
│               │   └── SensorController.java    # 传感器数据查询
│               ├── mapper/                      # MyBatis Mapper 接口
│               │   ├── AlertMapper.java
│               │   ├── CommandLogMapper.java
│               │   ├── DetectionMapper.java
│               │   ├── DeviceStatusMapper.java
│               │   ├── FaqMapper.java
│               │   └── SensorReadingMapper.java
│               ├── model/                       # 数据实体类
│               │   ├── Alert.java               # 告警记录
│               │   ├── CommandLog.java           # 指令日志
│               │   ├── Detection.java            # YOLO检测记录
│               │   ├── DeviceStatus.java         # 设备在线状态
│               │   ├── Faq.java                  # AI预设问题
│               │   └── SensorReading.java        # 传感器读数
│               └── service/                     # 业务服务
│                   ├── AlertEngineService.java   # 告警引擎（阈值检查+自动联动）
│                   ├── DeepSeekService.java      # DeepSeek AI（流式调用+上下文注入）
│                   ├── MqttGatewayService.java   # MQTT网关（消息收发+图片→推理）
│                   └── WebSocketService.java     # WebSocket 广播
│   
│   
│
└── yolo/                                       # 🤖 YOLO 安全帽检测
    ├── helmet_detection/                        # 主训练工程
    │   ├── scripts/
    │   │   ├── train.py                         # 训练脚本
    │   │   ├── helmet_detection.py              # 头盔合规匹配算法
    │   │   ├── zone_detection.py                # 区域入侵检测
    │   │   ├── alert_manager.py                 # 告警管理器
    │   │   └── runs/models/helmet_detection2/   # 当前使用模型
    │   │       └── weights/best.pt              # ⭐ 训练好的模型权重
    │   └── data/data.yaml                       # 数据集配置
    └── hardhat10k/                              # hardhat10k 数据集
        └── images/                              # 训练图片
```

---

## 数据库表结构（6张表）

| 表名 | 说明 | 关键字段 |
|------|------|------|
| `sensor_readings` | 传感器读数 | temperature, humidity, smoke_raw, gas_raw, distance, pir, photoelectric, counter, vibration |
| `detections` | YOLO检测记录 | total, compliant, no_helmet, persons_json |
| `alerts` | 告警记录 | alert_type, alert_level, risk_score, handled, handled_at, handled_by |
| `command_logs` | 指令日志 | target, action, source, reason |
| `device_status` | 设备在线状态 | online, wifi_rssi, free_heap, camera_ok |
| `faqs` | AI预设问题 | category, question, sort_order |

---

## MQTT Topic 设计

### 数据上报 (ESP32 → Broker → 后端)

| Topic | QoS | 格式 | 频率 |
|-------|:---:|------|:---:|
| `fg/{device_id}/sensors` | 1 | JSON | 5秒 + 事件驱动 |
| `fg/{device_id}/camera` | 0 | JPEG 二进制 | 2秒 |
| `fg/{device_id}/status` | 1 | JSON | 30秒 |

### 指令下发 (后端 → Broker → ESP32)

| Topic | 说明 |
|-------|------|
| `fg/{device_id}/cmd/relay/{1\|2\|3}` | 继电器控制 |
| `fg/{device_id}/cmd/buzzer` | 蜂鸣器 |
| `fg/{device_id}/cmd/led` | LED |
| `fg/{device_id}/cmd/all` | 紧急批量控制 |

---

## API 接口完整列表

### 传感器
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sensors/latest?deviceId=` | 最新传感器数据 |
| GET | `/api/sensors/history?deviceId=&from=&to=&page=&limit=` | 历史数据(分页) |

### 检测记录
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/detections?page=&limit=` | 检测记录列表 |
| GET | `/api/detections/{imageId}` | 单条检测详情 + 图片 |

### 告警
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/alerts?level=&handled=&from=&to=` | 告警列表 |
| GET | `/api/alerts/{id}` | 告警详情 |
| PUT | `/api/alerts/{id}/handle` | 标记已处理 `{"handledBy":"姓名"}` |

### 设备控制
| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/control/{deviceId}/relay/{1\|2\|3}` | 控制继电器 `{"action":"on"/"off"}` |
| POST | `/api/control/{deviceId}/buzzer` | 控制蜂鸣器 `{"action":"on"/"off"/"beep"}` |
| POST | `/api/control/{deviceId}/led` | 控制LED `{"action":"off"/"set","color":{"r":255,"g":0,"b":0}}` |
| GET | `/api/devices/status` | 设备在线状态 |
| GET | `/api/commands/logs?deviceId=&target=&from=&to=` | 指令历史 |

### 统计 & 健康
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 + WebSocket连接数 |
| GET | `/api/stats/summary` | 今日统计（检测/告警/计数） |
| GET | `/api/counter` | 今日货物计数 |

### AI 助手
| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/ai/faqs` | 预设问题列表（11条） |
| GET | `/api/ai/chat?message=问题` | DeepSeek 流式问答 |

---

## 接口测试验证

### 1. 健康检查
```cmd
curl http://localhost:8000/api/health
```
预期: `{"status":"ok","service":"FactoryGuard","websocketClients":0}`

### 2. 传感器数据
```cmd
# 发送测试数据（双击 test_send_sensor.bat 或手动）
curl http://localhost:8000/api/sensors/latest
curl "http://localhost:8000/api/sensors/history?limit=10"
```
预期: 返回温度28.5℃、湿度65.3%等传感器数据

### 3. 检测记录（需要先启动 Python 推理服务）
```cmd
# 发送测试图片（双击 test_send_camera.bat 或手动）
curl http://localhost:8000/api/detections
```
预期: 返回 YOLO 检测结果（人数、合规数、违规数）

### 4. 告警
```cmd
curl http://localhost:8000/api/alerts
curl "http://localhost:8000/api/alerts?handled=0"           # 未处理告警
curl -X PUT http://localhost:8000/api/alerts/1/handle -H "Content-Type: application/json" -d "{\"handledBy\":\"管理员\"}"
```

### 5. 统计
```cmd
curl http://localhost:8000/api/stats/summary
curl http://localhost:8000/api/counter
```

### 6. 设备控制
```cmd
# 开灯
curl -X POST http://localhost:8000/api/control/esp32-test/relay/1 -H "Content-Type: application/json" -d "{\"action\":\"on\",\"reason\":\"测试\"}"
# 蜂鸣器
curl -X POST http://localhost:8000/api/control/esp32-test/buzzer -H "Content-Type: application/json" -d "{\"action\":\"beep\"}"
# 查看指令日志
curl http://localhost:8000/api/commands/logs
```

### 7. AI 助手
```cmd
curl http://localhost:8000/api/ai/faqs
curl "http://localhost:8000/api/ai/chat?message=小鸿你好，介绍一下你自己"
```
第二个接口在浏览器打开可看到逐字流式输出效果。

---

## 图片链路完整流程

```
ESP32 拍照 → MQTT fg/+/camera (JPEG二进制)
    │
    ▼
Java MqttGatewayService 收到
    │
    ▼
HTTP POST localhost:8001/detect
    │
    ▼
Python YOLO 推理 (helmet_detection2/best.pt)
    │
    ▼
返回 JSON: {persons: [{status:"compliant"/"no_helmet",...}], summary: {...}}
    │
    ▼
Java 写入 detections 表 + alerts 表 + WebSocket 推送前端
```

---

## 告警自动联动规则

| 触发条件 | 等级 | 阈值 | 自动动作 |
|----------|:---:|------|------|
| 温度过高 | warning | >45°C | 排风扇开 |
| 烟雾超标 | serious | MQ-2 >2.5V | 排风扇开+蜂鸣器 |
| 可燃气泄漏 | emergency | MQ-5 >2.0V | 全关+排风扇+蜂鸣器+LED红 |
| 未戴安全帽 | warning | conf>0.35 | 写入告警+WebSocket推送 |
| 振动异常 | warning | 连续5次 | 推送预警 |
| PIR检测到人 | — | 0→1 | ESP32本地自动开灯(30秒后关) |

---

## 关键设计决策

| 决策 | 原因 |
|------|------|
| Java后端 + Python推理分离 | Java擅长业务/数据库，Python擅长AI推理 |
| 图片走二进制不转Base64 | 节省33%带宽，ESP32内存友好 |
| 传感器JSON + 图片二进制同一MQTT连接 | MQTT原生支持二进制，按Topic区分即可 |
| 不用Lombok | 避免JDK版本兼容问题（JDK内部API变更） |
| DeepSeek系统提示词注入实时数据 | 约束AI基于实际数据回答，减少幻觉 |
| counter BIGINT | ESP32的unsigned long可达42亿 |

---

## ESP32 硬件配置

```cpp
// factoryguard_esp32.ino 顶部 3 处必须修改：

const char* WIFI_SSID     = "你的WiFi名称";
const char* WIFI_PASSWORD = "你的WiFi密码";
const char* MQTT_BROKER   = "192.168.1.100";   // 后端电脑局域网IP
```

---

## 配置文件说明

| 文件 | 用途 |
|------|------|
| `application.yml` | Java后端：端口、MySQL、MQTT、DeepSeek Key、告警阈值 |
| `config.yaml` | Python后端：同上（备用） |
| `init_db.sql` | 建库建表 + FAQ默认数据 |

---

## 文档索引

| 文档 | 目标读者 | 内容 |
|------|------|------|
| `README.md`（本文件） | 所有开发者 | 项目总览、快速启动、API测试 |
| `API接口文档.md` | 前端/后端开发 | 完整API规范、数据格式、MQTT Topic |
| `硬件代码设计文档.md` | 硬件开发 | ESP32引脚、固件逻辑、数据上报格式 |
| `Mosquitto使用指南.md` | 后端 | Mosquitto安装、测试、模拟数据 |

---

> **项目名称**: FactoryGuard（鸿观智巡）
> **技术栈**: ESP32 + MQTT + Spring Boot + MyBatis-Plus + YOLOv5 + DeepSeek AI
