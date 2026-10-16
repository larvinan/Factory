# Mosquitto MQTT Broker 使用指南

> **适用对象**：后端开发 / 联调测试人员
> **软件**：Mosquitto 2.1.2
> **用途**：本地 MQTT 消息中转，连接 ESP32 硬件与后端

---

## 一、安装

Windows 系统选择 `mosquitto-2.1.2-install-windows-x64.exe`（64位系统），安装时一路 Next 即可。

安装完成后 Mosquitto 会自动注册为 Windows 服务，开机自动后台运行在 **1883** 端口。

> ⚠️ 安装后无需手动执行 `mosquitto -v` 启动，服务已在后台运行。再次执行会报"端口被占用"错误。

---

## 二、验证是否运行

```cmd
netstat -ano | findstr :1883
```

有输出说明 Mosquitto 已在 1883 端口监听。

---

## 三、服务管理

以**管理员身份**打开 CMD：

| 命令 | 用途 |
|------|------|
| `net start mosquitto` | 启动服务 |
| `net stop mosquitto` | 停止服务 |
| `mosquitto -v` | 前台调试模式，打印所有经过的消息（Ctrl+C 退出，**会先停掉后台服务再手动前台启动**） |

---

## 四、测试收发消息

打开 **两个 CMD 窗口**：

**窗口 1：订阅**

```cmd
mosquitto_sub -t "fg/+/sensors" -h localhost -v
```

**窗口 2：发布**

```cmd
mosquitto_pub -t "fg/test/sensors" -m "{\"temperature\":28.5}" -h localhost
```

窗口 1 收到 `fg/test/sensors {"temperature":28.5}` 即表示正常。

---

## 五、常用命令速查

| 命令 | 用途 |
|------|------|
| `mosquitto_sub -t "topic" -h localhost -v` | 订阅某个话题，`-v` 显示话题名 |
| `mosquitto_sub -t "fg/#" -h localhost -v` | 通配订阅 `fg/` 下所有子话题 |
| `mosquitto_pub -t "topic" -m "消息" -h localhost` | 发布一条消息 |

> ⚠️ **PowerShell 中的 JSON**：CMD 中用 `\"` 转义引号；PowerShell 中用单引号包 JSON：`'{"temperature":28.5}'`。推荐直接用 CMD。

---

## 六、模拟 ESP32 数据（无硬件时）

在没有实际 ESP32 硬件时，可以用 `mosquitto_pub` 模拟数据上报，测试后端是否正常接收。

### 模拟传感器数据

```cmd
mosquitto_pub -t "fg/esp32-test/sensors" -h localhost -m "{\"device_id\":\"esp32-test\",\"timestamp\":\"2026-07-20T16:00:00.000+08:00\",\"sensors\":{\"temperature\":{\"value\":28.5,\"unit\":\"°C\"},\"humidity\":{\"value\":65.3,\"unit\":\"%\"},\"smoke\":{\"value\":0.42,\"unit\":\"V\"},\"gas\":{\"value\":0.38,\"unit\":\"V\"},\"distance\":{\"value\":150,\"unit\":\"cm\"},\"pir\":{\"value\":1,\"unit\":\"bool\"},\"photoelectric\":{\"value\":0,\"unit\":\"bool\"},\"counter\":{\"value\":42,\"unit\":\"count\"},\"vibration\":{\"value\":0,\"unit\":\"bool\"}}}"
```

### 模拟心跳

```cmd
mosquitto_pub -t "fg/esp32-test/status" -h localhost -m "{\"device_id\":\"esp32-test\",\"timestamp\":\"2026-07-20T16:00:00.000+08:00\",\"uptime\":3600,\"free_heap\":124560,\"wifi_rssi\":-45,\"camera_ok\":true,\"sensor_count\":8,\"relay_status\":{\"1\":0,\"2\":1,\"3\":0},\"last_error\":\"\"}"
```

---

## 七、联调时监听实际通信

```cmd
mosquitto_sub -t "fg/#" -h localhost -v
```

实时查看 ESP32 和后端之间的所有 MQTT 消息，便于排查问题。

---

## 八、Topic 参考

| Topic | 方向 | 格式 |
|-------|------|------|
| `fg/{device_id}/sensors` | ESP32 → 后端 | JSON |
| `fg/{device_id}/camera` | ESP32 → 后端 | JPEG 二进制 |
| `fg/{device_id}/status` | ESP32 → 后端 | JSON |
| `fg/{device_id}/cmd/relay/{n}` | 后端 → ESP32 | JSON |
| `fg/{device_id}/cmd/buzzer` | 后端 → ESP32 | JSON |
| `fg/{device_id}/cmd/all` | 后端 → ESP32 | JSON |

---

> **文档版本**：v1.0
> **最后更新**：2026-07-20
