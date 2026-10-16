# 工厂传感器系统 · 上下行 MQTT 数据格式文档（v1.0）

## 一、MQTT 连接参数
| 项 | 值 |
|---|---|
| Broker 地址 | `10.153.135.142`（后端 PC 的 WLAN 局域网 IP，WiFi 名 `JAY`；PC 上本机测试用 `localhost` 亦可） |
| Broker 端口 | `1883` |
| MQTT 版本 | **3.1.1**（Level=4） |
| Client ID | `rk3568_factory_001` |
| 鉴权 | **匿名**（无 Username / Password） |
| Keep Alive | 60 秒 |
| Clean Session | true |

## 二、上行（STM32 → RK3568 → 后端）：传感器上报

| 项 | 值 |
|---|---|
| **Topic** | `factory/sensor/data` |
| **QoS** | 0（At most once） |
| **Payload 格式** | JSON（Content-Type: application/json 语义） |
| **上报周期** | **2 秒一次**（`CLOUD_POST_INTERVAL_SEC = 2`） |

### 2.1 完整 JSON 字段说明

```json
{
  "ts": 1724600000,
  "temp": 28.5,
  "humi": 43.0,
  "mq5_ppm": 465,
  "mq2_ppm": 77,
  "mq5_level": 28,
  "mq2_level": 0,
  "ldr_adc": 1659,
  "pir": 1,
  "light_on": 0,
  "rgb_color": 2,
  "beep": 0,
  "count": 0,
  "stock": 0
}
```

| 字段名 | 类型 | 单位/取值 | 说明 |
|---|---|---|---|
| **ts** | number (int64) | Unix 秒时间戳 | RK3568 本机实时时钟，`time(NULL)` 返回 |
| **temp** | number (float) | ℃ | 环境温度，来自 DHT11，精确到 0.1℃ |
| **humi** | number (float) | % | 环境相对湿度，来自 DHT11，精确到 0.1% |
| **mq5_ppm** | number (uint16) | ppm | MQ5（液化气/天然气/可燃气体）估算浓度（0~5000 典型） |
| **mq2_ppm** | number (uint16) | ppm | MQ2（烟雾/可燃气体）估算浓度（0~5000 典型） |
| **mq5_level** | number (uint8) | 0~100 | MQ5 浓度等级，对 ppm 做了线性归一到 0~100，便于前端直接做进度条/报警色 |
| **mq2_level** | number (uint8) | 0~100 | MQ2 浓度等级，同上 |
| **ldr_adc** | number (uint16) | 0~4095 | 光敏电阻 ADC 原始值（光弱→值大，光强→值小，取决于分压接法，现场标定） |
| **pir** | number (uint8) | 0 / 1 | 人体红外传感器：`1`=检测到人员存在，`0`=无人 |
| **light_on** | number (uint8) | 0 / 1 | 继电器控制的灯：`1`=开灯吸合，`0`=关灯释放 |
| **rgb_color** | number (uint8) | 0~7 | RGB 指示灯当前颜色：`0`=关，`1`=红，`2`=绿，`3`=黄(红+绿)，`4`=蓝，`5`=品红，`6`=青，`7`=白 |
| **beep** | number (uint8) | 0 / 1 | 蜂鸣器状态：`1`=正在响（或滴答周期的响阶段），`0`=安静 |
| **count** | number (uint16) | 计数（0~65535 循环） | 计数器模块（红外对射/光电门）实时 RAM 计数，掉电丢失（已保存部分见 stock） |
| **stock** | number (uint16) | 库存（0~65535） | 掉电持久化的库存值，保存在 STM32 内部 Flash，**每累计 100 次 count 写入一次** |

### 2.2 前端/后端常见业务逻辑
- **气体报警**：`mq5_ppm > 900` 或 `mq2_ppm > 300` → `rgb_color == 1`（红）+ `beep == 1`（滴答）
- **照明控制**：`pir == 1` 且 `ldr_adc > 2000`（光弱阈值，可调）→ `light_on == 1`
- **库存差**：`count - stock` 就是尚未落盘（<100 次）的增量

## 三、下行（后端 → RK3568 → STM32）：控制命令

| 项 | 值 |
|---|---|
| **Topic** | `factory/device/cmd` |
| **QoS** | 0 |
| **Payload 格式** | JSON |
| **字符编码** | UTF-8 |

### 3.1 命令通用格式

```json
{
  "method": "<命令名>",
  "params": { ... }
}
```

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| **method** | string | ✅ 是 | 命令名（见下表），max 31 字符 |
| **params** | object | 视命令 | 命令参数（见下表） |

---

### 3.2 命令列表

#### 1. 控制继电器（电灯开/关）—— `relay`

```json
{
  "method": "relay",
  "params": {
    "val": 1
  }
}
```

| params | 类型 | 值 |
|---|---|---|
| **val** | uint8 | `1`=吸合（开灯），`0`=释放（关灯） |

---

#### 2. 设置 RGB 指示灯颜色—— `rgb`

```json
{
  "method": "rgb",
  "params": {
    "val": 2
  }
}
```

| params | 类型 | 值 |
|---|---|---|
| **val** | uint8 | `0`=关，`1`=红，`2`=绿，`3`=黄(红+绿)，`4`=蓝，`5`=品红，`6`=青，`7`=白 |

---

#### 3. 控制蜂鸣器节奏—— `beep`

```json
{
  "method": "beep",
  "params": {
    "on_ms": 200,
    "off_ms": 500
  }
}
```

| params | 类型 | 取值范围 | 说明 |
|---|---|---|---|
| **on_ms** | uint8 | 0~255 ms | 响的时长；传 `0` = 静音 |
| **off_ms** | uint8 | 0~255 ms | 停的时长；传 `0` = 常响（如果 on_ms>0） |

**关蜂鸣器**：把两者都传 0 即可。

---

#### 4. 改写 Flash 持久化库存—— `stock`

```json
{
  "method": "stock",
  "params": {
    "val": 500
  }
}
```

| params | 类型 | 取值范围 | 说明 |
|---|---|---|---|
| **val** | uint16 | 0~65535 | 直接把 Flash 里的库存值改成这个数，**同时会把 RAM 计数 count 也设成这个数** |

⚠️ **注意**：每次调用都会触发 STM32 一整页 Flash 擦写。Flash 擦写寿命约 10,000 次。**不要高频调用此命令**（建议只做管理员确认操作）。

---

#### 5. 清零 Flash 库存—— `stock_reset`

```json
{
  "method": "stock_reset"
}
```

等价于 `stock` 命令传 `val=0`，但无需 params 对象。

## 四、错误与异常字段

| 情况 | 行为 |
|---|---|
| method 未知 | 静默忽略，RK3568 stderr 打印 `[cmd] unknown method: xxx`，不下发 STM32，不返回错误 |
| method 正确但 params 缺字段 | 缺数字字段按 `0` 处理；缺字符串字段按空串处理 |
| MQTT 连接断开 | RK3568 自动每 2 秒重试重连，最多连续失败 100 次后停止重连（再重启 rk_uplink 程序即可） |
| broker 端下发 QoS > 0 | 当前实现只处理 QoS 0，请后端 **发 QoS 0** |
| ts 字段为 0 或异常 | RK3568 本机时钟未同步，建议在 RK3568 上配 NTP |

## 五、字段来源溯源（给后端同学了解字段可信度）
| 字段 | 硬件/模块 | 可信度 | 备注 |
|---|---|---|---|
| temp/humi | DHT11 数字温湿度 | 中 | 精度 ±2℃ / ±5%RH，低成本传感器 |
| mq5_ppm / mq2_ppm | MQ-5 / MQ-2 半导体气敏 + ADC | 低~中 | 必须按 datasheet 校准 R0 值 + 两点校准 A/B 曲线；否则仅作趋势参考 |
| ldr_adc | 光敏电阻 + ADC | 高（原始值） | 光强阈值需在现场标定，分压电路决定方向 |
| pir | HC-SR501 人体红外 | 高 | 有延迟（典型几秒保持），存在方向/穿透误判 |
| rgb_color / beep / light_on | STM32 软件状态回读 | 高 | 由程序直接管理，状态准确 |
| count / stock | 光电门计数 + Flash | 高 | stock 每 100 次落盘，短时间掉电最多丢失 99 件 |
