# FactoryGuard（鸿观智巡）— API 接口文档

> 版本：v2.2 | 协议：MQTT + WebSocket | Broker：Mosquitto | 云平台：OneNET (中国移动)
>
> **Project**: 鸿观智巡——基于 OpenHarmony 的智慧工厂安全监测控制平台
>
> **Codename**: `factoryguard`

---

## 〇、八大功能模块与硬件映射

| # | 功能模块 | 涉及硬件 | 数据流 |
|---|----------|----------|--------|
| 1 | **温湿度智能监控** | DHT11 | ESP32 → MQTT → 后端 → DB + 前端 + OneNET |
| 2 | **红外感应照明** | HC-SR501 + Relay 1 → 照明灯 | PIR 触发 → ESP32 自动/后端指令 → 照明开关 |
| 3 | **危气监测与空气循环联动** | MQ-2 + MQ-5 + Relay 2 → 排风扇 + 蜂鸣器 | 气体超标 → 后端联动 → 排风扇开 + 蜂鸣器响 |
| 4 | **AGV避障系统** | HC-SR04 | ESP32 → MQTT → 后端 → 前端距离显示 |
| 5 | **货物感应计数** | 光电开关 | ESP32 → MQTT → 后端计数器累加 → DB + 前端 |
| 6 | **设备预测性维护** | SW-420 + DHT11(温度) | ESP32 → MQTT → 后端分析振动+温度趋势 → 预警 |
| 7 | **AI视觉安全监控** | ESP32-CAM 板载OV2640 + YOLO | 后端接收 MQTT 图片帧 → YOLO 推理 → 安全帽/禁区检测 → 告警 |
| 8 | **数字孪生大屏** | Three.js | 前端 ✅ 已完成 |

---

## 一、系统架构总览

```
┌─ 感知层 ───────────┐  ┌─ 边缘层 ──────┐  ┌─ 平台层 ───────────┐  ┌─ 应用层 ──────┐
│                    │  │              │  │                    │  │              │
│ ESP32-CAM 边缘网关 │  │ Mosquitto    │  │ FastAPI 后端       │  │ 浏览器       │
│ (板载OV2640)       │  │ (本地 Broker)│  │                    │  │              │
│ ├─ DHT11 温湿度    │MQ│              │MQ│ ├─ MQTT 双网关     │WS│ Dashboard   │
│ ├─ MQ-2 烟雾       │T │              │T │ │  本地←→硬件      │  │              │
│ ├─ MQ-5 可燃气     │  │              │  │ │  OneNET←→云平台  │  │ 实时监控     │
│ ├─ HC-SR04 超声波  │  │              │  │ ├─ YOLO 推理引擎   │  │ 手动控制     │
│ ├─ HC-SR501 PIR    │  │              │  │ ├─ 告警+联动引擎   │  │ 历史查询     │
│ ├─ 光电开关(计数)  │  │              │  │ ├─ 数据持久化     │  │ 3D数字孪生   │
│ ├─ SW-420 振动     │  │              │  │ ├─ WebSocket 推送  │  │              │
│ └─ 执行器          │  │              │  │ └─ OneNET 转发     │  │              │
│   Relay1→照明      │  │              │  │                    │  │              │
│   Relay2→排风扇    │  │              │  │                    │  │              │
│   Relay3→电磁阀    │  │              │  │                    │  │              │
│   蜂鸣器 + RGB LED │  │              │  │                    │  │              │
│                    │  │              │  │                    │  │              │
└────────────────────┘  └──────────────┘  │      │MQTT        │  └──────────────┘
                                          │      ▼            │
     ESP32-CAM ←──MQTT 指令── 后端 ───────│  OneNET 云平台    │
                                          │  (中国移动)       │
                                          └───────────────────┘
```

**三层通信，各司其职：**

| 链路 | 协议 | 数据 |
|------|------|------|
| ESP32-CAM → 后端 | MQTT (本地 Mosquitto) | 传感器读数 + 板载OV2640帧(监控+AI) + 心跳 |
| 后端 → ESP32-CAM | MQTT (本地 Mosquitto) | 继电器/蜂鸣器/LED 控制指令 |
| 后端 → 浏览器 | WebSocket | 实时检测结果 + 告警推送 + 传感器仪表盘 |
| 后端 → OneNET | MQTT (OneNET Broker) | 传感器数据 + 检测统计 + 告警事件 |

> **唯一摄像头：** ESP32-CAM 板载 OV2640，监控画面和 YOLO AI 推理共用同一路 MQTT 图片帧。

---

## 二、MQTT 基础约定

本系统涉及**两套 MQTT Broker**，后端同时连接两者：

| 项目 | 本地 Broker (Mosquitto) | OneNET Broker |
|------|------------------------|---------------|
| 地址 | `localhost` (开发) / 局域网 IP | `mqtts.heclouds.com` |
| 端口 | `1883` | `1883` / `8883` (TLS) |
| Client ID | ESP32=MAC；后端=`factoryguard-backend` | `{pid}_{device_name}` |
| 认证 | 无（局域网内） | Product ID + Token |
| QoS | 传感器/指令 QoS 1；图片 QoS 0 | QoS 1 |
| Keep Alive | 60 秒 | 60 秒 |
| 序列化 | JSON + Binary | OneNET 物模型 JSON |

---

## 三、本地 MQTT Topic 设计

### 3.1 数据上报（ESP32 → Broker → 后端）

| Topic | 类型 | QoS | 含义 |
|-------|:---:|:---:|------|
| `fg/{device_id}/sensors` | JSON | 1 | 全部传感器批量上报 |
| `fg/{device_id}/camera` | Binary | 0 | 板载OV2640 JPEG 监控帧 |
| `fg/{device_id}/status` | JSON | 1 | 心跳 + 设备健康状态 |

> 前缀 `fg` = factoryguard，简短省带宽。

### 3.2 指令下发（后端 → Broker → ESP32）

| Topic | 控制对象 | 对应继电器/GPIO |
|-------|----------|:---:|
| `fg/{device_id}/cmd/relay/1` | 照明灯 | Relay 1 |
| `fg/{device_id}/cmd/relay/2` | 排风扇 | Relay 2 |
| `fg/{device_id}/cmd/relay/3` | 电磁阀 | Relay 3 |
| `fg/{device_id}/cmd/buzzer` | 蜂鸣器 | GPIO 直连 |
| `fg/{device_id}/cmd/led` | RGB LED | GPIO RGB 三路 PWM |
| `fg/{device_id}/cmd/all` | 全部执行器 | 紧急批量控制 |

### 3.3 结果推送（后端 → Broker，前端通过 WebSocket 接收）

> 这些 topic 由后端发布到本地 Broker，供内部审计/日志使用。**前端 Dashboard 不直接订阅 MQTT**，而是通过 WebSocket 接收后端转发的实时数据。

| Topic | 类型 | QoS | 含义 |
|-------|:---:|:---:|------|
| `fg/system/detections` | JSON | 1 | YOLO 检测结果 |
| `fg/system/alerts` | JSON | 1 | 告警(含风险等级) |
| `fg/system/sensors/latest` | JSON | 1 | 最新传感器(转发) |

---

## 四、消息格式定义

### 4.1 传感器数据上报

`fg/{device_id}/sensors`

```json
{
  "device_id": "esp32-a1b2c3d4",
  "timestamp": "2025-01-15T14:30:05.123+08:00",
  "sensors": {
    "temperature":    { "value": 28.5, "unit": "°C" },
    "humidity":       { "value": 65.3, "unit": "%" },
    "smoke":          { "value": 0.42, "unit": "V" },
    "gas":            { "value": 0.38, "unit": "V" },
    "distance":       { "value": 150,  "unit": "cm" },
    "pir":            { "value": 1,    "unit": "bool" },
    "photoelectric":  { "value": 0,    "unit": "bool" },
    "counter":        { "value": 42,   "unit": "count" },
    "vibration":      { "value": 0,    "unit": "bool" }
  }
}
```

> **`counter`** 是 ESP32 上电以来的**累计值**（不断递增，不重置）。后端通过计算两次上报之间的差值得到增量，数据库存储每次上报的累计值。
> 前端/API 查"今日计数" = 当日最后一条记录的 counter − 当日第一条记录的 counter。
> MQ-2/MQ-5 上报原始电压值(0~5V)，后端换算 ppm 浓度。

### 4.2 图片帧上报

`fg/{device_id}/camera`

```
消息体 = 原始 JPEG 二进制字节 (板载OV2640, QVGA/VGA)
```

> 无 JSON 包装，直接二进制。QoS 0，丢帧不重发。

### 4.3 心跳/状态上报

`fg/{device_id}/status` — 每 30 秒

```json
{
  "device_id": "esp32-a1b2c3d4",
  "timestamp": "2025-01-15T14:30:00.000+08:00",
  "uptime": 3600,
  "free_heap": 124560,
  "wifi_rssi": -45,
  "camera_ok": true,
  "sensor_count": 8,
  "relay_status": { "1": 0, "2": 1, "3": 0 },
  "last_error": ""
}
```

### 4.4 指令下发

`fg/{device_id}/cmd/relay/1` （relay/2、relay/3 同理）

```json
{
  "action": "on",
  "timestamp": "2025-01-15T14:30:10.000+08:00",
  "source": "auto",
  "reason": "PIR检测到人员",
  "request_id": "uuid-xxxx"
}
```

| 执行器 | Topic | action 可选值 |
|--------|-------|--------------|
| Relay 1 (照明) | `cmd/relay/1` | `"on"` / `"off"` |
| Relay 2 (排风扇) | `cmd/relay/2` | `"on"` / `"off"` |
| Relay 3 (电磁阀) | `cmd/relay/3` | `"open"` / `"close"` |
| 蜂鸣器 | `cmd/buzzer` | `"on"` / `"off"` / `"beep"` |
| RGB LED | `cmd/led` | `"off"` 或 `{"r":255,"g":0,"b":0}` |

`fg/{device_id}/cmd/led`

```json
{
  "action": "set",
  "color": { "r": 255, "g": 0, "b": 0 },
  "timestamp": "2025-01-15T14:30:10.000+08:00",
  "request_id": "uuid-xxxx"
}
```

**批量紧急控制** — `fg/{device_id}/cmd/all`

```json
{
  "relay_1": "off",
  "relay_2": "on",
  "relay_3": "close",
  "buzzer": "on",
  "led": { "r": 255, "g": 0, "b": 0 },
  "reason": "可燃气泄漏紧急处置",
  "request_id": "uuid-xxxx"
}
```

> **字段映射：** `relay_1` → `cmd/relay/1` | `relay_2` → `cmd/relay/2` | `relay_3` → `cmd/relay/3` | `buzzer` → `cmd/buzzer` | `led` → `cmd/led`

### 4.5 YOLO 检测结果

`fg/system/detections` — 后端每处理一帧 OV2640 监控帧后发布

```json
{
  "camera": "ov2640",
  "timestamp": "2025-01-15T14:30:05.500+08:00",
  "image_id": "20250115_143005_001.jpg",
  "persons": [
    {
      "id": 1,
      "status": "compliant",
      "person_bbox": [100, 200, 150, 450],
      "helmet_bbox": [115, 210, 135, 250],
      "confidence": 0.82
    },
    {
      "id": 2,
      "status": "no_helmet",
      "person_bbox": [300, 180, 350, 420],
      "no_helmet_bbox": [315, 185, 335, 225],
      "confidence": 0.75
    }
  ],
  "summary": {
    "total_persons": 2,
    "compliant": 1,
    "no_helmet": 1,
    "unknown": 0
  }
}
```

### 4.6 告警消息

`fg/system/alerts`

```json
{
  "timestamp": "2025-01-15T14:30:05.500+08:00",
  "alert_type": "no_helmet",
  "alert_level": "warning",
  "risk_score": 10,
  "person_id": 2,
  "person_bbox": [300, 180, 350, 420],
  "image_id": "20250115_143005_001.jpg",
  "zone_name": null,
  "message": "检测到未佩戴安全帽人员"
}
```

**告警等级：**

| 风险分 | 等级 | 触发条件 |
|:---:|------|----------|
| 10 | `warning` | 没戴安全帽 |
| 20 | `serious` | 闯入禁区(戴了帽) |
| 30 | `emergency` | 没戴帽 + 闯入禁区 |

**`alert_type` 完整枚举：**

| alert_type | 含义 | 对应功能模块 |
|------------|------|:---:|
| `no_helmet` | 未佩戴安全帽 | 模块7 AI视觉 |
| `zone_violation` | 闯入禁区 | 模块7 AI视觉 |
| `no_helmet_and_zone` | 没戴帽 + 闯入禁区 | 模块7 AI视觉 |
| `gas_leak` | 可燃气泄漏(超阈值) | 模块3 危气监测 |
| `fire_smoke` | 烟雾超标(超阈值) | 模块3 危气监测 |
| `vibration_anomaly` | 设备振动异常 | 模块6 预测性维护 |
| `temperature_high` | 温度过高(超阈值) | 模块1 温湿度监控 |

---

## 五、WebSocket 消息格式（后端 → 前端浏览器）

WebSocket 端点：`ws://localhost:8000/ws`

所有消息包装在一个外层结构中以区分类型：

```json
{
  "type": "sensors" | "detection" | "alert" | "status",
  "data": { ... }
}
```

| type | 频率 | data 内容 |
|------|:---:|------|
| `sensors` | 5 秒 | 最新的传感器读数（同 4.1 的 sensors 字段） |
| `detection` | 每帧 | YOLO 检测结果（同 4.5） |
| `alert` | 事件驱动 | 告警消息（同 4.6） |
| `status` | 30 秒 | 设备在线状态 |

---

## 六、后端 HTTP API（前端 Dashboard 调用）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sensors/latest` | 最新传感器数据 |
| GET | `/api/sensors/history?from=&to=` | 历史数据(分页) |
| GET | `/api/detections?page=&limit=` | 检测记录列表 |
| GET | `/api/detections/{image_id}` | 单条检测详情 + 带框图片 |
| GET | `/api/alerts?level=&handled=&from=&to=` | 告警列表(可按等级/处理状态筛选) |
| GET | `/api/alerts/{id}` | 单条告警详情 |
| PUT | `/api/alerts/{id}/handle` | 标记告警为已处理 |
| GET | `/api/stats/summary` | 当日统计(人数/违规/告警/计数) |
| GET | `/api/counter` | 今日货物计数值 |
| POST | `/api/control/{device_id}/relay/{1|2|3}` | 手动控制继电器 |
| POST | `/api/control/{device_id}/buzzer` | 手动控制蜂鸣器 |
| POST | `/api/control/{device_id}/led` | 手动控制 RGB LED |
| GET | `/api/devices/status` | 所有设备在线状态 |
| GET | `/api/commands/logs?deviceId=&target=&from=&to=` | 指令日志查询 |
| GET | `/api/ai/faqs` | AI助手预设问题列表 |
| GET | `/api/ai/chat?message=问题` | AI助手流式问答(DeepSeek) |

**POST 控制接口请求体格式：**

```json
{
  "action": "on",
  "reason": "手动操作"
}
```

> relay/3 用 `"open"` / `"close"`；led 的 action 为 `"set"` 时需附带 `"color": {"r":255,"g":0,"b":0}`。

### 告警处理接口请求体

```json
{
  "handledBy": "操作员姓名"
}
```

### AI 助手接口

**GET `/api/ai/faqs`** — 返回预设高频问题列表：

```json
{
  "status": "ok",
  "data": [
    {"id":1,"category":"sensor","question":"当前温度是否正常？","sortOrder":1},
    {"id":2,"category":"sensor","question":"最近一小时湿度变化趋势？","sortOrder":2}
  ]
}
```

**GET `/api/ai/chat?message=问题`** — 流式问答，返回纯文本流：

```
请求: GET /api/ai/chat?message=当前温度是否正常

响应: text/plain; charset=UTF-8 (流式逐字输出)
28.5℃属于正常范围，未超过45℃告警阈值...
```

> DeepSeek 会根据系统实时数据（传感器、告警、检测记录、设备状态）生成回答，避免幻觉。需要配置 `application.yml` 中的 `deepseek.api-key`。

---

## 七、数据存储表结构（MySQL）

> 字符集：`utf8mb4` | 引擎：`InnoDB` | 时区：`+08:00`

### 7.1 sensor_readings — 传感器读数表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT AUTO_INCREMENT PK | 自增 |
| device_id | VARCHAR(32) NOT NULL | ESP32 设备标识 |
| timestamp | DATETIME(3) NOT NULL | 采集时间(毫秒精度) |
| temperature | FLOAT | 温度 °C |
| humidity | FLOAT | 湿度 % |
| smoke_raw | FLOAT | MQ-2 电压 V |
| gas_raw | FLOAT | MQ-5 电压 V |
| distance | INT | 超声波距离 cm |
| pir | TINYINT | 人体红外 0/1 |
| photoelectric | TINYINT | 光电开关 0/1 |
| counter | BIGINT | 光电累计计数(ESP32 unsigned long) |
| vibration | TINYINT | 振动 0/1 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | 入库时间 |

```sql
CREATE TABLE sensor_readings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(32) NOT NULL,
  timestamp DATETIME(3) NOT NULL,
  temperature FLOAT COMMENT '温度 °C',
  humidity FLOAT COMMENT '湿度 %',
  smoke_raw FLOAT COMMENT 'MQ-2 电压 V',
  gas_raw FLOAT COMMENT 'MQ-5 电压 V',
  distance INT COMMENT '超声波距离 cm',
  pir TINYINT COMMENT '人体红外 0/1',
  photoelectric TINYINT COMMENT '光电开关 0/1',
  counter INT COMMENT '光电累计计数',
  vibration TINYINT COMMENT '振动 0/1',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_time (device_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 7.2 detections — 视觉检测记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT AUTO_INCREMENT PK | 自增 |
| timestamp | DATETIME(3) NOT NULL | 检测时间 |
| camera | VARCHAR(16) | ov2640 |
| image_path | VARCHAR(255) | 带框图片路径 |
| persons_json | JSON | 完整检测结果 |
| total | INT | 总人数 |
| compliant | INT | 戴帽人数 |
| no_helmet | INT | 未戴帽人数 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | 入库时间 |

```sql
CREATE TABLE detections (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME(3) NOT NULL,
  camera VARCHAR(16) COMMENT 'ov2640',
  image_path VARCHAR(255) COMMENT '带框图片路径',
  persons_json JSON COMMENT '完整检测结果',
  total INT COMMENT '总人数',
  compliant INT COMMENT '戴帽人数',
  no_helmet INT COMMENT '未戴帽人数',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 7.3 alerts — 告警记录表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT AUTO_INCREMENT PK | 自增 |
| timestamp | DATETIME(3) NOT NULL | 告警时间 |
| alert_type | VARCHAR(32) NOT NULL | no_helmet / zone_violation / gas_leak / fire_smoke / vibration_anomaly / temperature_high |
| alert_level | VARCHAR(16) NOT NULL | warning / serious / emergency |
| risk_score | INT | 10/20/30 |
| details | JSON | 告警详情(含坐标/图片等) |
| image_id | VARCHAR(255) | 关联图片 |
| handled | TINYINT DEFAULT 0 | 0=未处理, 1=已处理 |
| handled_at | DATETIME(3) | 处理时间 |
| handled_by | VARCHAR(64) | 处理人 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | 入库时间 |

```sql
CREATE TABLE alerts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME(3) NOT NULL,
  alert_type VARCHAR(32) NOT NULL COMMENT '告警类型',
  alert_level VARCHAR(16) NOT NULL COMMENT '告警等级',
  risk_score INT COMMENT '风险分',
  details JSON COMMENT '告警详情',
  image_id VARCHAR(255) COMMENT '关联图片',
  handled TINYINT DEFAULT 0 COMMENT '0=未处理 1=已处理',
  handled_at DATETIME(3) COMMENT '处理时间',
  handled_by VARCHAR(64) COMMENT '处理人',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alert_level (alert_level, timestamp),
  INDEX idx_handled (handled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 7.4 command_logs — 指令日志表

| 字段 | 类型 | 说明 |
|------|------|------|
| id | BIGINT AUTO_INCREMENT PK | 自增 |
| timestamp | DATETIME(3) NOT NULL | 指令时间 |
| device_id | VARCHAR(32) NOT NULL | 目标设备 |
| target | VARCHAR(16) NOT NULL | relay_1/relay_2/relay_3/buzzer/led |
| action | VARCHAR(32) NOT NULL | on/off/open/close/beep |
| source | VARCHAR(16) | manual / auto |
| reason | VARCHAR(255) | 触发原因 |
| created_at | DATETIME DEFAULT CURRENT_TIMESTAMP | 入库时间 |

```sql
CREATE TABLE command_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME(3) NOT NULL,
  device_id VARCHAR(32) NOT NULL,
  target VARCHAR(16) NOT NULL COMMENT 'relay_1/relay_2/relay_3/buzzer/led',
  action JSON COMMENT '指令内容',
  source VARCHAR(16) COMMENT 'manual / auto',
  reason VARCHAR(255) COMMENT '触发原因',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_time (device_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 7.5 索引说明

| 表 | 索引 | 用途 |
|----|------|------|
| sensor_readings | `(device_id, timestamp)` | 按设备查历史传感器数据 |
| detections | `(timestamp)` | 按时间查检测记录 |
| alerts | `(alert_level, timestamp)` | 按等级筛选告警 |
| alerts | `(handled)` | 查未处理告警 |
| command_logs | `(device_id, timestamp)` | 按设备查指令历史 |

---

## 八、ESP32 端工作流程

```
setup():
  ① 连 WiFi (STA 模式)
  ② 连本地 MQTT Broker
  ③ 订阅: fg/{device_id}/cmd/# (所有指令 topic)
  ④ 初始化传感器 + 板载OV2640 + 继电器引脚 + 蜂鸣器 + LED

loop():
  每 5 秒: 读取所有传感器 + 光电计数值 → publish fg/{device_id}/sensors
  每 2 秒: 板载OV2640 拍一帧 → publish fg/{device_id}/camera (binary)
  每 30 秒: publish fg/{device_id}/status

  PIR/光电/振动 中断: 状态变化时立即单发一条 sensors 消息

MQTT 回调 (收到指令):
  cmd/relay/1 → digitalWrite(RELAY1_PIN, action=="on" ? HIGH : LOW)
  cmd/relay/2 → digitalWrite(RELAY2_PIN, action=="on" ? HIGH : LOW)
  cmd/relay/3 → digitalWrite(RELAY3_PIN, action=="open" ? HIGH : LOW)
  cmd/buzzer  → action=="beep" ? tone() : digitalWrite()
  cmd/led     → action=="off" ? 全灭 : analogWrite(R/G/B, color.r/g/b)
  cmd/all     → 依次执行上述所有
```

---

## 九、后端工作流程

```
启动:
  ① 加载 YOLO 模型 + 告警阈值配置
  ② 连接本地 Mosquitto + 连接 OneNET Broker
  ③ 订阅本地: fg/+/sensors, fg/+/camera, fg/+/status
  ④ 启动推理队列 + Worker 线程(独立线程消费图片帧跑 YOLO)
  ⑤ 连接 MySQL，自动建表
  ⑥ 启动 FastAPI + WebSocket

MQTT 回调 (轻量，不阻塞):
  收到 camera  → 丢入推理队列(立即返回)
  收到 sensors → 写 DB → WebSocket 推送前端 → OneNET 转发
                → 阈值检查: 烟雾/可燃气/温度/振动超标 → 触发告警联动
  收到 status  → 更新设备在线状态

推理 Worker 线程 (独立运行，不阻塞 MQTT):
  从队列取帧 → cv2.imdecode() 解码 JPEG → YOLO 推理
  → helmet_detection → zone_detection
  → 画框存图 → 写入 detections 表 → alert_manager
  → 有告警 → publish fg/system/alerts + WebSocket 推送前端
          → 自动联动: publish fg/{id}/cmd/relay/2 "on" (排风扇)
                      publish fg/{id}/cmd/buzzer "beep"

HTTP 路由:
  查询类 → 查 DB 返回 JSON
  控制类 → publish fg/{id}/cmd/xxx → 写 command_logs
```

---

## 十、传感器上报策略

| 传感器 | 策略 | 频率 |
|--------|------|:---:|
| DHT11 温湿度 | 定时 | 5 秒 |
| MQ-2 烟雾 | 定时 | 5 秒 |
| MQ-5 可燃气 | 定时 | 5 秒 |
| HC-SR04 超声波 | 定时 | 2 秒 |
| HC-SR501 PIR | **事件驱动** | 变化时立即上报 |
| 光电开关 | **事件驱动** | 光束通→断瞬间上报，累加 counter |
| SW-420 振动 | **事件驱动** | 检测到振动立即上报 |
| 板载OV2640 | 定时 | 2 秒 |

> 事件驱动的传感器无变化时每 30 秒发一次心跳值(附带当前状态)。

---

## 十一、告警自动联动规则

| 触发条件 | 等级 | 阈值 | 自动联动动作 |
|----------|:---:|------|-------------|
| 没戴安全帽 | warning | conf > 0.35 | LED 红灯闪 + 蜂鸣器短促 |
| 闯入禁区 | serious | — | LED 红灯闪 + 蜂鸣器 3 声 |
| 没戴帽 + 禁区 | emergency | — | 蜂鸣器长鸣 + LED 常亮红 + Relay2 排风扇开 + Relay3 电磁阀关 |
| 烟雾(MQ-2)超标 | serious | > 2.5V | 蜂鸣器长鸣 + Relay2 排风扇开 |
| 可燃气(MQ-5)超标 | emergency | > 2.0V | 蜂鸣器长鸣 + Relay2 排风扇开 + Relay3 电磁阀关 + LED 红灯 |
| PIR 检测到人 | — | 0→1 | **ESP32 本地自动**：Relay1 照明开；无人后本地延迟 30 秒关灯 |
| 振动异常 | warning | 连续 5 次=1 | 推送预警到前端 |
| 温度过高 | warning | > 45°C | Relay2 排风扇开 |

> 阈值定义在 `config.yaml`，修改后重启后端生效。
> 烟雾/可燃气阈值需根据实际 MQ-2/MQ-5 标定结果调整。

---

## 十二、OneNET 云平台接入

### 12.1 上传策略

| 数据 | 上传 | 说明 |
|------|:---:|------|
| 传感器读数 | ✅ 全部 | 每条都上报 |
| YOLO 检测统计 | ✅ 全部 | 人数+合规数+违规数+合规率 |
| 告警事件 | ✅ 全部 | 类型+等级+风险分 |
| 原始图片 | ❌ | 存本地，用 `image_id` 关联 |

### 12.2 Topic

| Topic | 方向 |
|-------|------|
| `$sys/{pid}/{device_name}/thing/property/post` | 后端→OneNET |
| `$sys/{pid}/{device_name}/thing/event/post` | 后端→OneNET |

### 12.3 物模型属性清单

| 标识符 | 类型 | 说明 |
|--------|:---:|------|
| `temperature` | float | 温度 °C |
| `humidity` | float | 湿度 % |
| `smoke_voltage` | float | MQ-2 电压 V |
| `gas_voltage` | float | MQ-5 电压 V |
| `distance` | int | 超声波距离 cm |
| `pir_status` | int | 人体红外 0/1 |
| `photoelectric` | int | 光电开关 0/1 |
| `counter` | int | 货物累计计数 |
| `vibration` | int | 振动 0/1 |
| `total_persons` | int | 检测总人数 |
| `compliant_count` | int | 合规人数 |
| `no_helmet_count` | int | 违规人数 |
| `unknown_count` | int | 状态不明人数 |
| `helmet_rate` | float | 合规率 % |
| `image_id` | string | 关联图片文件名 |

### 12.4 传感器上报示例

```json
{
  "id": "sensor_1736921405123",
  "version": "1.0",
  "params": {
    "temperature":   { "value": 28.5, "time": 1736921405123 },
    "humidity":      { "value": 65.3, "time": 1736921405123 },
    "smoke_voltage": { "value": 0.42, "time": 1736921405123 },
    "gas_voltage":   { "value": 0.38, "time": 1736921405123 },
    "distance":      { "value": 150,  "time": 1736921405123 },
    "pir_status":    { "value": 1,    "time": 1736921405123 },
    "photoelectric": { "value": 0,    "time": 1736921405123 },
    "counter":       { "value": 42,   "time": 1736921405123 },
    "vibration":     { "value": 0,    "time": 1736921405123 }
  }
}
```

### 12.5 检测结果上报示例

```json
{
  "id": "det_1736921405500",
  "version": "1.0",
  "params": {
    "total_persons":   { "value": 2 },
    "compliant_count": { "value": 1 },
    "no_helmet_count": { "value": 1 },
    "unknown_count":   { "value": 0 },
    "helmet_rate":     { "value": 50.0 },
    "image_id":        { "value": "20250115_143005_001.jpg" }
  }
}
```

### 12.6 告警事件上报示例

```json
{
  "id": "alert_1736921405500",
  "version": "1.0",
  "params": {
    "alert_type":  { "value": "no_helmet" },
    "alert_level": { "value": "warning" },
    "risk_score":  { "value": 10 },
    "message":     { "value": "检测到未佩戴安全帽人员" },
    "image_id":    { "value": "20250115_143005_001.jpg" }
  }
}
```

---

## 十三、设备标识与图片存储

### 13.1 device_id 生成规则

`device_id` = ESP32 **WiFi MAC 地址**（唯一且不可变），格式示例：`esp32-a1b2c3d4e5f6`

```cpp
// ESP32 端获取
String device_id = "esp32-" + WiFi.macAddress();  // 如 "esp32-A1:B2:C3:D4:E5:F6"
device_id.replace(":", "");
device_id.toLowerCase();  // → "esp32-a1b2c3d4e5f6"
```

> 烧录同一份固件到多台 ESP32，每台自动获得不同 device_id，无需手动配置。

### 13.2 图片存储目录

```
data/
├── images/
│   ├── 2025-01-15/
│   │   ├── 20250115_143005_001_raw.jpg    ← OV2640 原始帧
│   │   └── 20250115_143005_001_boxed.jpg  ← YOLO 画框结果
│   └── ...
└── ...
```

- 按日期分目录，自动创建
- `image_path` 字段存储相对路径：`images/2025-01-15/20250115_143005_001_raw.jpg`
- 定期清理：保留最近 7 天原始帧，画框图保留 30 天（定时任务）

### 13.3 配置文件（config.yaml）

```yaml
# FactoryGuard 后端配置

mqtt:
  local:
    host: localhost
    port: 1883
    client_id: factoryguard-backend
    topics:
      sensors: fg/+/sensors
      camera: fg/+/camera
      status: fg/+/status

onenet:
  enabled: false          # 注册 OneNET 后改为 true
  host: mqtts.heclouds.com
  port: 8883
  product_id: ""          # OneNET 产品 ID
  device_name: ""         # OneNET 设备名称
  token: ""               # OneNET 鉴权 token

mysql:
  host: localhost
  port: 3306
  user: root
  password: ""
  database: factoryguard

yolo:
  model_path: yolo/helmet_detection/scripts/runs/models/helmet_detection2/weights/best.pt
  conf_threshold: 0.35
  iou_threshold: 0.45
  input_size: 640

thresholds:
  temperature_high: 45.0      # °C，温度过高告警
  smoke_voltage_high: 2.5     # V，MQ-2 烟雾超标
  gas_voltage_high: 2.0       # V，MQ-5 可燃气超标
  vibration_consecutive: 5    # 连续检测到振动的次数阈值

image:
  save_dir: data/images
  raw_retention_days: 7       # 原始帧保留天数
  boxed_retention_days: 30    # 画框图保留天数

server:
  host: 0.0.0.0
  port: 8000
```

---

## 十四、错误处理策略

| 场景 | 处理方式 |
|------|---------|
| MQTT Broker 断连 | 自动重连(指数退避，最大 30 秒间隔)，重连后自动重新订阅 |
| MySQL 断连 | 请求返回 503 + 错误信息，自动重连池 |
| OneNET 断连 | 本地正常运行不受影响，OneNET 断连日志告警，自动重连 |
| ESP32 离线(90秒无心跳) | WebSocket 推送设备离线状态，前端显示 🔴 |
| 推理队列积压(>10帧) | 丢弃最旧帧，只保留最新帧推理 |
| 摄像头获取帧失败 | 日志记录，跳过当前帧，不影响系统运行 |
| 继电器/执行器无响应 | 指令发送后超时 3 秒，记录失败日志 |
