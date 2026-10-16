-- FactoryGuard 数据库初始化脚本 v2.0
-- 对齐《MQTT数据格式.md》v1.0（RK3568 + STM32 硬件协议）
-- MySQL 8.0+ / MariaDB 10.5+
-- ⚠️ 本文件为 UTF-8 编码；SET NAMES 防止客户端默认字符集(如gbk)导致中文乱码固化

SET NAMES utf8mb4;

CREATE DATABASE IF NOT EXISTS factoryguard
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE factoryguard;

-- ============================================
-- 1. 传感器读数表（对应上行 factory/sensor/data 扁平 JSON）
-- 上行周期 2 秒一次；字段与硬件文档 2.1 一一对应
-- ============================================
CREATE TABLE IF NOT EXISTS sensor_readings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(32) NOT NULL COMMENT 'RK3568 网关标识(如 rk3568_factory_001)',
  timestamp DATETIME(3) NOT NULL COMMENT '采集时间(ts Unix秒, ts=0 时回退服务器时间)',
  temp FLOAT COMMENT '温度 ℃ (DHT11, 0.1℃精度)',
  humi FLOAT COMMENT '相对湿度 % (DHT11)',
  mq5_ppm INT COMMENT 'MQ5 可燃气体浓度 ppm (0~5000)',
  mq2_ppm INT COMMENT 'MQ2 烟雾浓度 ppm (0~5000)',
  mq5_level TINYINT COMMENT 'MQ5 归一等级 0~100',
  mq2_level TINYINT COMMENT 'MQ2 归一等级 0~100',
  ldr_adc SMALLINT COMMENT '光敏电阻 ADC 原始值 0~4095 (光弱→值大)',
  pir TINYINT COMMENT '人体红外 0/1 (1=有人)',
  light_on TINYINT COMMENT '继电器灯状态 0/1 (1=开灯)',
  rgb_color TINYINT COMMENT 'RGB 颜色 0~7 (0关 1红 2绿 3黄 4蓝 5品红 6青 7白)',
  beep TINYINT COMMENT '蜂鸣器状态 0/1 (1=响)',
  count INT COMMENT '计数器 RAM 实时计数 (掉电丢失)',
  stock INT COMMENT 'Flash 持久化库存 (每累计100次落盘)',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  INDEX idx_device_time (device_id, timestamp),
  INDEX idx_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='传感器读数表(RK3568 协议)';

-- ============================================
-- 2. 设备状态表（RK3568 无心跳 topic，按最近收到数据时间判离线）
-- 同时缓存执行器当前状态，供前端直接读取
-- ============================================
CREATE TABLE IF NOT EXISTS device_status (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(32) NOT NULL COMMENT 'RK3568 网关标识',
  online TINYINT DEFAULT 0 COMMENT '0=离线 1=在线(超时自动置0)',
  last_heartbeat DATETIME(3) COMMENT '最后收到 factory/sensor/data 的时间',
  light_on TINYINT DEFAULT 0 COMMENT '灯当前状态 0/1',
  rgb_color TINYINT DEFAULT 0 COMMENT 'RGB 当前颜色 0~7',
  beep TINYINT DEFAULT 0 COMMENT '蜂鸣器当前状态 0/1',
  last_error TEXT COMMENT '最近错误信息',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_device (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='设备状态表(RK3568)';

-- ============================================
-- 3. 告警记录表
-- ============================================
CREATE TABLE IF NOT EXISTS alerts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME(3) NOT NULL COMMENT '告警时间',
  device_id VARCHAR(32) NOT NULL COMMENT 'RK3568 网关标识',
  alert_type VARCHAR(32) NOT NULL COMMENT '告警类型: gas_leak(mq5超标)/fire_smoke(mq2超标)/temperature_high/high_humidity',
  alert_level VARCHAR(16) NOT NULL COMMENT '告警等级: warning/serious/emergency',
  risk_score INT DEFAULT 0 COMMENT '风险分 10/20/30',
  details JSON COMMENT '告警详情(超标数值等)',
  image_id VARCHAR(255) COMMENT '关联图片(预留)',
  handled TINYINT DEFAULT 0 COMMENT '0=未处理 1=已处理',
  handled_at DATETIME(3) COMMENT '处理时间',
  handled_by VARCHAR(64) COMMENT '处理人',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  INDEX idx_alert_level (alert_level, timestamp),
  INDEX idx_handled (handled),
  INDEX idx_device_time (device_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='告警记录表';

-- ============================================
-- 4. 指令日志表（对应下行 factory/device/cmd {method, params}）
-- ============================================
CREATE TABLE IF NOT EXISTS command_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME(3) NOT NULL COMMENT '指令时间',
  device_id VARCHAR(32) NOT NULL COMMENT '目标设备(RK3568 网关)',
  target VARCHAR(16) NOT NULL COMMENT '命令名: relay/rgb/beep/stock/stock_reset',
  action VARCHAR(64) NOT NULL COMMENT '参数摘要, 如 val=1 / on_ms=200,off_ms=500',
  source VARCHAR(16) DEFAULT 'manual' COMMENT 'manual/auto(告警联动)',
  reason VARCHAR(255) COMMENT '触发原因',
  request_id VARCHAR(64) COMMENT '追踪ID',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  INDEX idx_device_time (device_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='指令日志表(RK3568 协议)';

-- ============================================
-- 5. 视觉检测记录表（ESP32-CAM 通道，本期硬件未接入，结构保留）
-- ============================================
CREATE TABLE IF NOT EXISTS detections (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  timestamp DATETIME(3) NOT NULL COMMENT '检测时间',
  device_id VARCHAR(32) NOT NULL DEFAULT 'esp32-unknown' COMMENT 'ESP32 设备标识',
  camera VARCHAR(16) DEFAULT 'ov2640' COMMENT '摄像头来源',
  image_path VARCHAR(255) COMMENT '原始帧路径',
  boxed_image_path VARCHAR(255) COMMENT '画框图路径',
  persons_json JSON COMMENT '完整检测结果',
  total INT DEFAULT 0 COMMENT '总人数',
  compliant INT DEFAULT 0 COMMENT '戴帽人数',
  no_helmet INT DEFAULT 0 COMMENT '未戴帽人数',
  unknown INT DEFAULT 0 COMMENT '状态不明人数',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  INDEX idx_timestamp (timestamp),
  INDEX idx_device_time (device_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='视觉检测记录表(保留)';

-- ============================================
-- 6. FAQ 预设问题表
-- ============================================
CREATE TABLE IF NOT EXISTS faqs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  category VARCHAR(32) NOT NULL COMMENT '分类: sensor/alert/device/system',
  question VARCHAR(255) NOT NULL COMMENT '预设问题',
  sort_order INT DEFAULT 0 COMMENT '排序',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_question (question)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='AI助手预设问题表';

INSERT IGNORE INTO faqs (category, question, sort_order) VALUES
('sensor', '现在工厂环境情况怎么样？', 1),
('sensor', '温湿度是否在安全范围内？', 2),
('sensor', '烟雾和可燃气浓度有异常吗？', 3),
('sensor', '今天的货物通过量是多少？', 4),
('alert', '目前有哪些告警需要处理？', 5),
('alert', '今天触发了多少次警报？', 6),
('device', '工厂里有哪些设备在线？', 8),
('device', 'RK3568网关运行状态正常吗？', 9),
('system', '出现告警时我该怎么处理？', 10),
('system', 'FactoryGuard平台有哪些核心功能？', 11);

-- ============================================
-- 7. 用户表（Web 账号登录 + 微信小程序登录共存）
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) DEFAULT NULL COMMENT '微信 openid(小程序登录, 可空)',
  username VARCHAR(64) DEFAULT NULL COMMENT 'Web 登录用户名(唯一)',
  password VARCHAR(128) DEFAULT NULL COMMENT 'Web 登录密码(安全性后续升级为BCrypt)',
  nickname VARCHAR(64) DEFAULT '微信用户' COMMENT '昵称',
  avatar VARCHAR(512) COMMENT '头像URL',
  role VARCHAR(16) DEFAULT 'user' COMMENT '角色: admin/inspector/user',
  phone VARCHAR(20) COMMENT '手机号',
  department VARCHAR(64) COMMENT '部门',
  create_time DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  update_time DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  UNIQUE KEY uk_openid (openid),
  UNIQUE KEY uk_username (username),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='用户表';

-- 预置账号：admin/admin123(管理员) user/user123(普通员工)
INSERT IGNORE INTO users (username, password, nickname, role, department) VALUES
('admin', 'admin123', '超级管理员', 'admin', '安全管理部'),
('user', 'user123', '普通员工', 'user', '生产车间');

-- ============================================
-- 8. 设备档案表（按真实硬件清单预置）
-- ============================================
CREATE TABLE IF NOT EXISTS devices (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(32) NOT NULL COMMENT '设备唯一标识',
  name VARCHAR(128) NOT NULL COMMENT '设备名称',
  type VARCHAR(32) NOT NULL COMMENT '设备类型: gateway/temperature/humidity/gas/smoke/light_sensor/pir/light/rgb/buzzer/counter',
  category VARCHAR(16) NOT NULL COMMENT '设备分类: gateway/sensor/actuator',
  location VARCHAR(128) DEFAULT '车间A' COMMENT '安装位置',
  model VARCHAR(64) COMMENT '设备型号',
  manufacturer VARCHAR(64) COMMENT '厂商',
  description VARCHAR(255) COMMENT '设备描述',
  qr_code VARCHAR(255) COMMENT '二维码内容',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  UNIQUE KEY uk_device_id (device_id),
  INDEX idx_category (category),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='设备档案表';

-- 真实硬件清单（依据《MQTT数据格式.md》第五章字段来源溯源）
INSERT IGNORE INTO devices (device_id, name, type, category, location, model, manufacturer, description) VALUES
('rk3568_factory_001', '车间A数据网关', 'gateway', 'gateway', '车间A-控制柜', 'RK3568', '瑞芯微', 'MQTT 网关，上行 factory/sensor/data，下行 factory/device/cmd'),
('dht11_01', '温湿度传感器', 'temperature', 'sensor', '车间A-环境区', 'DHT11', 'Aosong', '环境温度湿度，精度±2℃/±5%RH'),
('mq5_01', '可燃气体传感器', 'gas', 'sensor', '车间A-燃气区', 'MQ-5', 'Hanwei', '液化气/天然气浓度 ppm，报警阈值 900ppm'),
('mq2_01', '烟雾传感器', 'smoke', 'sensor', '车间A-烟雾区', 'MQ-2', 'Hanwei', '烟雾/可燃气体浓度 ppm，报警阈值 300ppm'),
('ldr_01', '光照传感器', 'light_sensor', 'sensor', '车间A-顶部', 'LDR+ADC', '-', '光敏电阻 ADC 0~4095，光弱值大'),
('pir_01', '人体红外传感器', 'pir', 'sensor', '车间A-入口', 'HC-SR501', 'HC', '人员存在检测，有数秒保持延迟'),
('light_01', '照明继电器', 'light', 'actuator', '车间A-顶部', '继电器模块', '-', '车间照明开关，命令 relay val=0/1'),
('rgb_01', 'RGB 指示灯', 'rgb', 'actuator', '车间A-报警面板', 'RGB LED', '-', '状态指示灯 0~7 色，命令 rgb val=0~7'),
('beep_01', '蜂鸣器', 'buzzer', 'actuator', '车间A-报警面板', '有源蜂鸣器', '-', '报警蜂鸣，命令 beep on_ms/off_ms'),
('counter_01', '货物计数器', 'counter', 'sensor', '车间A-传送带', '红外对射', '-', 'count RAM 计数 + stock Flash 库存，命令 stock/stock_reset');

-- ============================================
-- 9. 隐患上报表
-- ============================================
CREATE TABLE IF NOT EXISTS hazards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(32) NOT NULL COMMENT '隐患类型: fire/gas_leak/electrical/structural/blockage/violation/storage/other',
  description TEXT COMMENT '隐患描述',
  location VARCHAR(128) COMMENT '隐患位置',
  image_url VARCHAR(512) COMMENT '图片URL',
  status VARCHAR(16) DEFAULT 'pending' COMMENT '状态: pending/processing/resolved',
  reporter_openid VARCHAR(64) COMMENT '上报人openid',
  reporter_name VARCHAR(64) COMMENT '上报人姓名',
  handled_at DATETIME(3) COMMENT '处理时间',
  handled_by VARCHAR(64) COMMENT '处理人',
  handle_note TEXT COMMENT '处理备注',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  INDEX idx_status (status),
  INDEX idx_reporter (reporter_openid),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='隐患上报表';

-- ============================================
-- 10. 通知设置表
-- ============================================
CREATE TABLE IF NOT EXISTS notify_settings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NOT NULL COMMENT '用户标识(openid或username)',
  gas_warning TINYINT DEFAULT 1 COMMENT '燃气预警通知',
  gas_alarm TINYINT DEFAULT 1 COMMENT '燃气紧急告警通知',
  smoke_alarm TINYINT DEFAULT 1 COMMENT '烟雾告警通知',
  flame_alarm TINYINT DEFAULT 1 COMMENT '火焰告警通知',
  system_offline TINYINT DEFAULT 1 COMMENT '系统离线通知',
  all_alarm TINYINT DEFAULT 1 COMMENT '全部告警总开关',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  UNIQUE KEY uk_openid (openid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='通知设置表';

-- ============================================
-- 11. 智能联动规则表
-- 设计参考 Home Assistant Trigger-Action 自动化模式
-- （状态翻转去抖借鉴其 hysteresis/for 防抖思想）
-- ============================================
CREATE TABLE IF NOT EXISTS automation_rules (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL COMMENT '规则名称',
  field VARCHAR(32) NOT NULL COMMENT '触发字段: temp/humi/mq5_ppm/mq2_ppm/ldr_adc/pir/light_on/count/stock',
  operator VARCHAR(8) NOT NULL COMMENT '比较符: gt/lt/eq',
  threshold DOUBLE NOT NULL COMMENT '阈值',
  action_method VARCHAR(16) NOT NULL COMMENT '动作命令: relay/rgb/beep',
  action_params VARCHAR(128) NOT NULL COMMENT '动作参数JSON, 如 {"val":1}',
  enabled TINYINT DEFAULT 1 COMMENT '0=禁用 1=启用',
  last_state TINYINT DEFAULT 0 COMMENT '上一帧是否命中, 用于状态翻转去抖',
  last_fired_at DATETIME(3) DEFAULT NULL COMMENT '最近一次触发时间',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  INDEX idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='智能联动规则表';

-- ============================================
-- 12. 运行时可调配置表（报警阈值等，前端可修改）
-- ============================================
CREATE TABLE IF NOT EXISTS app_config (
  config_key VARCHAR(64) PRIMARY KEY,
  config_value VARCHAR(128) NOT NULL,
  description VARCHAR(128) DEFAULT NULL,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='运行时可调配置(报警阈值等)';

INSERT IGNORE INTO app_config (config_key, config_value, description) VALUES
('temperature_high', '45.0', '温度告警阈值(℃)'),
('mq5_ppm_high', '900', '可燃气报警阈值(ppm)'),
('mq2_ppm_high', '300', '烟雾报警阈值(ppm)');


