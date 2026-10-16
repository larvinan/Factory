# FactoryGuard 智慧工厂安全监测控制平台

> 基于 RK3568 + STM32 真实硬件的智慧工厂安全监测系统，覆盖「环境感知 → 智能告警 → 远程控制 → AI 视觉检测 → 多工厂管理」完整链路，提供 **Web 管理控制台** 与 **支付宝小程序** 双端。

![Java](https://img.shields.io/badge/Java-21-orange) ![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.2.5-green) ![Vue](https://img.shields.io/badge/Vue-3.5-42b883) ![Taro](https://img.shields.io/badge/Taro-4.1-1a6dff) ![MySQL](https://img.shields.io/badge/MySQL-8.0-4479a1) ![YOLOv8](https://img.shields.io/badge/YOLOv8-ultralytics-red)

---

## ✨ 功能特性

| 模块 | 能力 |
|---|---|
| 🌡 实时监测 | 温湿度 / 可燃气 / 烟雾 / 光照 / 人员在场，2 秒一帧 MQTT 上报，WebSocket 实时推送 |
| 🎛 远程控制 | 继电器输出、RGB 指示灯（7 色）、蜂鸣器节奏、Flash 库存管理，Web 与小程序双端下发 |
| 🚨 智能告警 | 气体/温度阈值告警 + 硬件自动联动（红灯 + 蜂鸣），状态翻转去抖防刷屏，支持批量处理 |
| 🔗 智能联动 | 用户自定义 Trigger-Action 规则引擎 + 一键场景模式（生产/下班/警戒） |
| 🪖 AI 安全帽检测 | 图片上传检测、RK3568 摄像头视频流轮询、小程序端 4 秒定时自动检测，YOLOv8 标注图回显 + 未戴帽自动告警 |
| 🏭 多工厂管理 | 工厂 → 车间 → 设备三级层级，双端增删改查、全局切换、数据按厂过滤 |
| 📋 巡检任务 | 任务分配 / 扫码打卡 / 自动完成，车间与点位管理 |
| 🗺 环境安全分析 | 多维指标综合评分 + 应对措施建议 + Word/PDF 报告导出（DeepSeek AI 助手集成） |
| 💬 意见反馈 | 分类 / 严重度 / 截图反馈，状态流转 + 官方回复闭环，QQ 邮箱异步通知管理员 |
| 📱 双端架构 | Web 管理控制台（Vue 3 + Element Plus）+ 支付宝小程序（Taro 4 + React） |

---

## 🏗 系统架构

```
STM32 传感器/执行器 ──UART──▶ RK3568 网关 ──MQTT──▶ Mosquitto :1883
                                                    │
     ┌──────────────────────────────────────────────┤
     ▼                                              │
Spring Boot 后端 :8000 ──HTTP──▶ YOLO 推理服务 :8001  │
 (REST + WebSocket + MySQL)     (Python ultralytics) │
     │                                              │
     ├──▶ Web 前端 Vue3 :5173                        │
     └──▶ 支付宝小程序 (Taro) ◀── 摄像头视频流/检测 ────┘
```

详见 [项目设计文档.md](项目设计文档.md)。

---

## 🚀 快速开始

### 环境要求

JDK 21 ｜ Maven 3.9+ ｜ Node.js 18+ ｜ MySQL 8.0 ｜ Mosquitto 2.1.2（[安装包随项目提供](factory/esp32_camera_web/mosquitto-2.1.2-install-windows-x64.exe)）｜ Python 3.11（ultralytics + torch + opencv）｜ 支付宝小程序开发者工具

### 一键启动

```bash
# 1. 初始化数据库（首次）
mysql -uroot -p < backend-java/src/main/resources/init_db.sql
cd 后端目录后依次执行 sql/V2、V3、V4 增量迁移

# 2. 双击根目录脚本，自动拉起推理服务(8001) + Web 前端(5173)
start_all.bat

# 3. 启动后端（IDEA 运行 FactoryGuardApplication，或命令行）
mvn spring-boot:run "-Dspring-boot.run.jvmArguments=-Dfile.encoding=UTF-8"
```

### 默认账号

| 角色 | 账号 | 密码 |
|---|---|---|
| 管理员 | `admin` | `admin123` |
| 普通用户 | `user` | `user123` |

### 验证

| 服务 | 地址 |
|---|---|
| 后端健康检查 | http://localhost:8000/api/health |
| YOLO 推理服务 | http://localhost:8001/health |
| Web 控制台 | http://localhost:5173 |
| 小程序 | 支付宝开发者工具打开 `mini-program/dist` |

> 完整安装步骤（Mosquitto 配置 / 防火墙 / 数据库迁移 / 小程序运行 / QQ 邮箱配置）见 [使用手册.md](使用手册.md)。

---

## 📁 目录结构

```
factory_pro_gpt01/
├── start_all.bat / stop_all.bat    # 一键启动/停止（推理服务 + 前端）
├── 使用手册.md                      # 环境安装与运行指南
├── 项目设计文档.md                  # 架构与设计详解
├── MQTT数据格式.md                  # 硬件通信协议 v1.0
├── factory/
│   └── esp32_camera_web/
│       ├── backend-java/           # Spring Boot 后端（17 个 Controller）
│       │   ├── sql/                # V2~V4 增量迁移脚本
│       │   └── src/main/resources/init_db.sql
│       ├── inference_server.py     # YOLO 推理微服务 (:8001)
│       ├── simulate_camera_stream.py # 摄像头帧模拟器（MQTT 推流）
│       └── tools/                  # RK3568 硬件模拟器
├── factorydemo/                    # Web 前端（Vue 3 + Element Plus + ECharts + Three.js）
└── mini-program/                   # 支付宝小程序（Taro 4 + React，双击 start 前先 dev:alipay 构建）
```

---

## 📚 文档

| 文档 | 内容 |
|---|---|
| [使用手册.md](使用手册.md) | 环境安装、服务启动、小程序运行、邮箱配置、硬件接入、FAQ |
| [项目设计文档.md](项目设计文档.md) | 系统架构、模块设计、数据流、API 清单、设计决策 |
| [MQTT数据格式.md](MQTT数据格式.md) | 硬件通信协议（上行字段 / 下行命令 / 业务阈值）|

---

## 🧭 日常使用速查

| 场景 | 操作 |
|---|---|
| 每天开工 | 双击 `start_all.bat` → IDEA 启动后端 → 30 秒后可用 |
| 收工 | 双击 `stop_all.bat` → IDEA 停止后端 |
| 安全帽检测 | 小程序「检测」页上传图片，或切「RK3568 视频流」开启 4 秒定时检测 |
| 多工厂 | Web「工厂管理」/ 小程序「我的 → 工厂管理」增删改查与切换 |
| 意见反馈 | 双端提交 → 管理员 QQ 邮箱收到通知 → 「意见反馈」页处理并回复 |
| 无硬件演示 | `Rk3568Simulator gas` 触发告警联动；`simulate_camera_stream.py` 驱动视频流 |

---

## 📄 License

仅供学习与内部使用。
