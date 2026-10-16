-- MySQL dump 10.13  Distrib 8.0.40, for Win64 (x86_64)
--
-- Host: localhost    Database: factoryguard
-- ------------------------------------------------------
-- Server version	8.0.40

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Current Database: `factoryguard`
--

/*!40000 DROP DATABASE IF EXISTS `factoryguard`*/;

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `factoryguard` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;

USE `factoryguard`;

--
-- Table structure for table `alerts`
--

DROP TABLE IF EXISTS `alerts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `alerts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `timestamp` datetime(3) NOT NULL COMMENT '告警时间',
  `device_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'RK3568 网关标识',
  `alert_type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警类型: gas_leak(mq5超标)/fire_smoke(mq2超标)/temperature_high/high_humidity',
  `alert_level` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '告警等级: warning/serious/emergency',
  `risk_score` int DEFAULT '0' COMMENT '风险分 10/20/30',
  `details` json DEFAULT NULL COMMENT '告警详情(超标数值等)',
  `image_id` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '关联图片(预留)',
  `handled` tinyint DEFAULT '0' COMMENT '0=未处理 1=已处理',
  `handled_at` datetime(3) DEFAULT NULL COMMENT '处理时间',
  `handled_by` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '处理人',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  `workshop_id` bigint DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_alert_level` (`alert_level`,`timestamp`),
  KEY `idx_handled` (`handled`),
  KEY `idx_device_time` (`device_id`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='告警记录表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `alerts`
--

LOCK TABLES `alerts` WRITE;
/*!40000 ALTER TABLE `alerts` DISABLE KEYS */;
/*!40000 ALTER TABLE `alerts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `app_config`
--

DROP TABLE IF EXISTS `app_config`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `app_config` (
  `config_key` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `config_value` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`config_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运行时可调配置(报警阈值等)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `app_config`
--

LOCK TABLES `app_config` WRITE;
/*!40000 ALTER TABLE `app_config` DISABLE KEYS */;
INSERT INTO `app_config` VALUES ('mq2_ppm_high','300','烟雾报警阈值(ppm)','2026-09-03 21:31:00.672'),('mq5_ppm_high','900','可燃气报警阈值(ppm)','2026-09-03 21:31:00.672'),('temperature_high','45.0','温度告警阈值(℃)','2026-09-03 21:31:00.672');
/*!40000 ALTER TABLE `app_config` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `automation_rules`
--

DROP TABLE IF EXISTS `automation_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `automation_rules` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '规则名称',
  `field` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '触发字段: temp/humi/mq5_ppm/mq2_ppm/ldr_adc/pir/light_on/count/stock',
  `operator` varchar(8) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '比较符: gt/lt/eq',
  `threshold` double NOT NULL COMMENT '阈值',
  `action_method` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '动作命令: relay/rgb/beep',
  `action_params` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '动作参数JSON, 如 {"val":1}',
  `enabled` tinyint DEFAULT '1' COMMENT '0=禁用 1=启用',
  `last_state` tinyint DEFAULT '0' COMMENT '上一帧是否命中, 用于状态翻转去抖',
  `last_fired_at` datetime(3) DEFAULT NULL COMMENT '最近一次触发时间',
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='智能联动规则表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `automation_rules`
--

LOCK TABLES `automation_rules` WRITE;
/*!40000 ALTER TABLE `automation_rules` DISABLE KEYS */;
/*!40000 ALTER TABLE `automation_rules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `command_logs`
--

DROP TABLE IF EXISTS `command_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `command_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `timestamp` datetime(3) NOT NULL COMMENT '指令时间',
  `device_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '目标设备(RK3568 网关)',
  `target` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '命令名: relay/rgb/beep/stock/stock_reset',
  `action` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '参数摘要, 如 val=1 / on_ms=200,off_ms=500',
  `source` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'manual' COMMENT 'manual/auto(告警联动)',
  `reason` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '触发原因',
  `request_id` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '追踪ID',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_time` (`device_id`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='指令日志表(RK3568 协议)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `command_logs`
--

LOCK TABLES `command_logs` WRITE;
/*!40000 ALTER TABLE `command_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `command_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `detections`
--

DROP TABLE IF EXISTS `detections`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `detections` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `timestamp` datetime(3) NOT NULL COMMENT '检测时间',
  `device_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'esp32-unknown' COMMENT 'ESP32 设备标识',
  `camera` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'ov2640' COMMENT '摄像头来源',
  `image_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '原始帧路径',
  `boxed_image_path` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '画框图路径',
  `persons_json` json DEFAULT NULL COMMENT '完整检测结果',
  `total` int DEFAULT '0' COMMENT '总人数',
  `compliant` int DEFAULT '0' COMMENT '戴帽人数',
  `no_helmet` int DEFAULT '0' COMMENT '未戴帽人数',
  `unknown` int DEFAULT '0' COMMENT '状态不明人数',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  PRIMARY KEY (`id`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_device_time` (`device_id`,`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='视觉检测记录表(保留)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `detections`
--

LOCK TABLES `detections` WRITE;
/*!40000 ALTER TABLE `detections` DISABLE KEYS */;
/*!40000 ALTER TABLE `detections` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_status`
--

DROP TABLE IF EXISTS `device_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_status` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'RK3568 网关标识',
  `online` tinyint DEFAULT '0' COMMENT '0=离线 1=在线(超时自动置0)',
  `last_heartbeat` datetime(3) DEFAULT NULL COMMENT '最后收到 factory/sensor/data 的时间',
  `light_on` tinyint DEFAULT '0' COMMENT '灯当前状态 0/1',
  `rgb_color` tinyint DEFAULT '0' COMMENT 'RGB 当前颜色 0~7',
  `beep` tinyint DEFAULT '0' COMMENT '蜂鸣器当前状态 0/1',
  `last_error` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '最近错误信息',
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device` (`device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备状态表(RK3568)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_status`
--

LOCK TABLES `device_status` WRITE;
/*!40000 ALTER TABLE `device_status` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_status` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `devices`
--

DROP TABLE IF EXISTS `devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `devices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备唯一标识',
  `name` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备名称',
  `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备类型: gateway/temperature/humidity/gas/smoke/light_sensor/pir/light/rgb/buzzer/counter',
  `category` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '设备分类: gateway/sensor/actuator',
  `location` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '车间A' COMMENT '安装位置',
  `model` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备型号',
  `manufacturer` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '厂商',
  `description` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '设备描述',
  `qr_code` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '二维码内容',
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  `workshop_id` bigint DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_device_id` (`device_id`),
  KEY `idx_category` (`category`),
  KEY `idx_type` (`type`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备档案表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `devices`
--

LOCK TABLES `devices` WRITE;
/*!40000 ALTER TABLE `devices` DISABLE KEYS */;
INSERT INTO `devices` VALUES (1,'rk3568_factory_001','车间A数据网关','gateway','gateway','车间A-控制柜','RK3568','瑞芯微','MQTT 网关，上行 factory/sensor/data，下行 factory/device/cmd',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1),(2,'dht11_01','温湿度传感器','temperature','sensor','车间A-环境区','DHT11','Aosong','环境温度湿度，精度±2℃/±5%RH',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1),(3,'mq5_01','可燃气体传感器','gas','sensor','车间A-燃气区','MQ-5','Hanwei','液化气/天然气浓度 ppm，报警阈值 900ppm',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1),(4,'mq2_01','烟雾传感器','smoke','sensor','车间A-烟雾区','MQ-2','Hanwei','烟雾/可燃气体浓度 ppm，报警阈值 300ppm',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1),(5,'ldr_01','光照传感器','light_sensor','sensor','车间A-顶部','LDR+ADC','-','光敏电阻 ADC 0~4095，光弱值大',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1),(6,'pir_01','人体红外传感器','pir','sensor','车间A-入口','HC-SR501','HC','人员存在检测，有数秒保持延迟',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1),(7,'light_01','照明继电器','light','actuator','车间A-顶部','继电器模块','-','车间照明开关，命令 relay val=0/1',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1),(8,'rgb_01','RGB 指示灯','rgb','actuator','车间A-报警面板','RGB LED','-','状态指示灯 0~7 色，命令 rgb val=0~7',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1),(9,'beep_01','蜂鸣器','buzzer','actuator','车间A-报警面板','有源蜂鸣器','-','报警蜂鸣，命令 beep on_ms/off_ms',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1),(10,'counter_01','货物计数器','counter','sensor','车间A-传送带','红外对射','-','count RAM 计数 + stock Flash 库存，命令 stock/stock_reset',NULL,'2026-09-03 21:31:00.572','2026-09-03 21:31:00.572',1);
/*!40000 ALTER TABLE `devices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `factories`
--

DROP TABLE IF EXISTS `factories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `factories` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(32) NOT NULL,
  `name` varchar(64) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `manager` varchar(64) DEFAULT NULL,
  `phone` varchar(32) DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `status` varchar(16) DEFAULT 'active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `factories`
--

LOCK TABLES `factories` WRITE;
/*!40000 ALTER TABLE `factories` DISABLE KEYS */;
INSERT INTO `factories` VALUES (1,'F-01','第一工厂','总部园区A区','默认工厂',NULL,1,'active','2026-09-03 21:31:01');
/*!40000 ALTER TABLE `factories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `faqs`
--

DROP TABLE IF EXISTS `faqs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `faqs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `category` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '分类: sensor/alert/device/system',
  `question` varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '预设问题',
  `sort_order` int DEFAULT '0' COMMENT '排序',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_question` (`question`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI助手预设问题表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `faqs`
--

LOCK TABLES `faqs` WRITE;
/*!40000 ALTER TABLE `faqs` DISABLE KEYS */;
INSERT INTO `faqs` VALUES (1,'sensor','现在工厂环境情况怎么样？',1,'2026-09-03 21:31:00'),(2,'sensor','温湿度是否在安全范围内？',2,'2026-09-03 21:31:00'),(3,'sensor','烟雾和可燃气浓度有异常吗？',3,'2026-09-03 21:31:00'),(4,'sensor','今天的货物通过量是多少？',4,'2026-09-03 21:31:00'),(5,'alert','目前有哪些告警需要处理？',5,'2026-09-03 21:31:00'),(6,'alert','今天触发了多少次警报？',6,'2026-09-03 21:31:00'),(7,'device','工厂里有哪些设备在线？',8,'2026-09-03 21:31:00'),(8,'device','RK3568网关运行状态正常吗？',9,'2026-09-03 21:31:00'),(9,'system','出现告警时我该怎么处理？',10,'2026-09-03 21:31:00'),(10,'system','FactoryGuard平台有哪些核心功能？',11,'2026-09-03 21:31:00');
/*!40000 ALTER TABLE `faqs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `feedbacks`
--

DROP TABLE IF EXISTS `feedbacks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feedbacks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `type` varchar(16) NOT NULL DEFAULT 'bug',
  `severity` varchar(16) DEFAULT 'medium',
  `title` varchar(128) NOT NULL,
  `content` text NOT NULL,
  `contact` varchar(64) DEFAULT NULL,
  `images` varchar(1024) DEFAULT NULL,
  `status` varchar(16) DEFAULT 'pending',
  `reply` text,
  `handled_by` varchar(64) DEFAULT NULL,
  `handled_at` datetime DEFAULT NULL,
  `reporter_type` varchar(16) DEFAULT NULL,
  `reporter_id` varchar(64) DEFAULT NULL,
  `reporter_name` varchar(64) DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_reporter` (`reporter_id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `feedbacks`
--

LOCK TABLES `feedbacks` WRITE;
/*!40000 ALTER TABLE `feedbacks` DISABLE KEYS */;
/*!40000 ALTER TABLE `feedbacks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `hazards`
--

DROP TABLE IF EXISTS `hazards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `hazards` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `type` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '隐患类型: fire/gas_leak/electrical/structural/blockage/violation/storage/other',
  `description` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '隐患描述',
  `location` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '隐患位置',
  `image_url` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '图片URL',
  `status` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'pending' COMMENT '状态: pending/processing/resolved',
  `reporter_openid` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上报人openid',
  `reporter_name` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上报人姓名',
  `handled_at` datetime(3) DEFAULT NULL COMMENT '处理时间',
  `handled_by` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '处理人',
  `handle_note` text CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci COMMENT '处理备注',
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `workshop_id` bigint DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_reporter` (`reporter_openid`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='隐患上报表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `hazards`
--

LOCK TABLES `hazards` WRITE;
/*!40000 ALTER TABLE `hazards` DISABLE KEYS */;
/*!40000 ALTER TABLE `hazards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspection_checkins`
--

DROP TABLE IF EXISTS `inspection_checkins`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_checkins` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `task_id` bigint NOT NULL,
  `point_id` bigint DEFAULT NULL,
  `point_code` varchar(32) DEFAULT NULL,
  `point_name` varchar(64) DEFAULT NULL,
  `inspector_name` varchar(64) DEFAULT NULL,
  `checkin_time` datetime DEFAULT CURRENT_TIMESTAMP,
  `remark` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_task` (`task_id`),
  KEY `idx_point` (`point_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspection_checkins`
--

LOCK TABLES `inspection_checkins` WRITE;
/*!40000 ALTER TABLE `inspection_checkins` DISABLE KEYS */;
/*!40000 ALTER TABLE `inspection_checkins` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspection_points`
--

DROP TABLE IF EXISTS `inspection_points`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_points` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `workshop_id` bigint DEFAULT '1',
  `code` varchar(32) NOT NULL,
  `name` varchar(64) NOT NULL,
  `location` varchar(128) DEFAULT NULL,
  `qr_content` varchar(255) DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `required` tinyint DEFAULT '1',
  `status` varchar(16) DEFAULT 'active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_workshop` (`workshop_id`)
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspection_points`
--

LOCK TABLES `inspection_points` WRITE;
/*!40000 ALTER TABLE `inspection_points` DISABLE KEYS */;
INSERT INTO `inspection_points` VALUES (1,1,'PT-101','温湿度监测点','1号车间东侧','PT-101',1,1,'active','2026-09-03 21:31:00','2026-09-03 21:31:00'),(2,1,'PT-102','燃气监测点','1号车间燃气管线区','PT-102',2,1,'active','2026-09-03 21:31:00','2026-09-03 21:31:00'),(3,1,'PT-103','消防通道A','1号车间北门','PT-103',3,1,'active','2026-09-03 21:31:00','2026-09-03 21:31:00'),(4,1,'PT-104','控制柜','1号车间配电室','PT-104',4,0,'active','2026-09-03 21:31:00','2026-09-03 21:31:00'),(5,2,'PT-201','环境监测点','2号车间中区','PT-201',1,1,'active','2026-09-03 21:31:00','2026-09-03 21:31:00'),(6,2,'PT-202','通风设备','2号车间西侧','PT-202',2,1,'active','2026-09-03 21:31:00','2026-09-03 21:31:00'),(7,3,'PT-301','烟雾监测点','3号车间仓储区','PT-301',1,1,'active','2026-09-03 21:31:00','2026-09-03 21:31:00'),(8,3,'PT-302','消防器材柜','3号车间入口','PT-302',2,1,'active','2026-09-03 21:31:00','2026-09-03 21:31:00');
/*!40000 ALTER TABLE `inspection_points` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `inspection_tasks`
--

DROP TABLE IF EXISTS `inspection_tasks`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `inspection_tasks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `workshop_id` bigint DEFAULT '1',
  `title` varchar(128) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `inspector_openid` varchar(64) DEFAULT NULL,
  `inspector_name` varchar(64) DEFAULT NULL,
  `status` varchar(16) DEFAULT 'pending',
  `priority` varchar(16) DEFAULT 'normal',
  `scheduled_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `items_json` json DEFAULT NULL,
  `result_note` text,
  `completed_at` datetime DEFAULT NULL,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_workshop` (`workshop_id`),
  KEY `idx_status` (`status`),
  KEY `idx_inspector` (`inspector_openid`),
  KEY `idx_scheduled` (`scheduled_date`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `inspection_tasks`
--

LOCK TABLES `inspection_tasks` WRITE;
/*!40000 ALTER TABLE `inspection_tasks` DISABLE KEYS */;
INSERT INTO `inspection_tasks` VALUES (1,1,'1号车间日常安全巡检','检查温湿度设备运行状态、燃气泄漏、消防通道畅通',NULL,'张三','assigned','high','2026-09-03','2026-09-04','[{\"item\": \"温湿度设备运行状态\", \"required\": true}, {\"item\": \"燃气管道密封性\", \"required\": true}, {\"item\": \"消防通道畅通\", \"required\": true}]',NULL,NULL,'2026-09-03 21:31:00','2026-09-03 21:31:00'),(2,1,'1号车间设备点检','检查继电器输出、蜂鸣器、RGB 指示灯功能正常',NULL,'李四','pending','normal','2026-09-03','2026-09-05','[{\"item\": \"继电器输出通断测试\", \"required\": true}, {\"item\": \"蜂鸣器鸣响测试\", \"required\": true}, {\"item\": \"RGB 指示灯颜色切换\", \"required\": false}]',NULL,NULL,'2026-09-03 21:31:00','2026-09-03 21:31:00'),(3,2,'2号车间环境巡检','检查温湿度及通风设备',NULL,NULL,'pending','normal','2026-09-03','2026-09-06','[{\"item\": \"温湿度传感器校准\", \"required\": true}, {\"item\": \"通风设备运行\", \"required\": true}]',NULL,NULL,'2026-09-03 21:31:00','2026-09-03 21:31:00'),(4,3,'3号车间消防专项巡检','检查烟雾浓度监测及消防设施',NULL,'王五','in_progress','urgent','2026-09-03','2026-09-03','[{\"item\": \"烟雾传感器灵敏度\", \"required\": true}, {\"item\": \"灭火器压力\", \"required\": true}, {\"item\": \"消防通道畅通\", \"required\": true}]',NULL,NULL,'2026-09-03 21:31:00','2026-09-03 21:31:00');
/*!40000 ALTER TABLE `inspection_tasks` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notify_settings`
--

DROP TABLE IF EXISTS `notify_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notify_settings` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `openid` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '用户标识(openid或username)',
  `gas_warning` tinyint DEFAULT '1' COMMENT '燃气预警通知',
  `gas_alarm` tinyint DEFAULT '1' COMMENT '燃气紧急告警通知',
  `smoke_alarm` tinyint DEFAULT '1' COMMENT '烟雾告警通知',
  `flame_alarm` tinyint DEFAULT '1' COMMENT '火焰告警通知',
  `system_offline` tinyint DEFAULT '1' COMMENT '系统离线通知',
  `all_alarm` tinyint DEFAULT '1' COMMENT '全部告警总开关',
  `created_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='通知设置表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notify_settings`
--

LOCK TABLES `notify_settings` WRITE;
/*!40000 ALTER TABLE `notify_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `notify_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sensor_readings`
--

DROP TABLE IF EXISTS `sensor_readings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sensor_readings` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` varchar(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'RK3568 网关标识(如 rk3568_factory_001)',
  `timestamp` datetime(3) NOT NULL COMMENT '采集时间(ts Unix秒, ts=0 时回退服务器时间)',
  `temp` float DEFAULT NULL COMMENT '温度 ℃ (DHT11, 0.1℃精度)',
  `humi` float DEFAULT NULL COMMENT '相对湿度 % (DHT11)',
  `mq5_ppm` int DEFAULT NULL COMMENT 'MQ5 可燃气体浓度 ppm (0~5000)',
  `mq2_ppm` int DEFAULT NULL COMMENT 'MQ2 烟雾浓度 ppm (0~5000)',
  `mq5_level` tinyint DEFAULT NULL COMMENT 'MQ5 归一等级 0~100',
  `mq2_level` tinyint DEFAULT NULL COMMENT 'MQ2 归一等级 0~100',
  `ldr_adc` smallint DEFAULT NULL COMMENT '光敏电阻 ADC 原始值 0~4095 (光弱→值大)',
  `pir` tinyint DEFAULT NULL COMMENT '人体红外 0/1 (1=有人)',
  `light_on` tinyint DEFAULT NULL COMMENT '继电器灯状态 0/1 (1=开灯)',
  `rgb_color` tinyint DEFAULT NULL COMMENT 'RGB 颜色 0~7 (0关 1红 2绿 3黄 4蓝 5品红 6青 7白)',
  `beep` tinyint DEFAULT NULL COMMENT '蜂鸣器状态 0/1 (1=响)',
  `count` int DEFAULT NULL COMMENT '计数器 RAM 实时计数 (掉电丢失)',
  `stock` int DEFAULT NULL COMMENT 'Flash 持久化库存 (每累计100次落盘)',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP COMMENT '入库时间',
  PRIMARY KEY (`id`),
  KEY `idx_device_time` (`device_id`,`timestamp`),
  KEY `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='传感器读数表(RK3568 协议)';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sensor_readings`
--

LOCK TABLES `sensor_readings` WRITE;
/*!40000 ALTER TABLE `sensor_readings` DISABLE KEYS */;
/*!40000 ALTER TABLE `sensor_readings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `openid` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '微信 openid(小程序登录, 可空)',
  `username` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Web 登录用户名(唯一)',
  `password` varchar(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'Web 登录密码(安全性后续升级为BCrypt)',
  `nickname` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT '微信用户' COMMENT '昵称',
  `avatar` varchar(512) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '头像URL',
  `role` varchar(16) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT 'user' COMMENT '角色: admin/inspector/user',
  `phone` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '手机号',
  `department` varchar(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '部门',
  `create_time` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `update_time` datetime(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_openid` (`openid`),
  UNIQUE KEY `uk_username` (`username`),
  KEY `idx_role` (`role`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,NULL,'admin','admin123','超级管理员',NULL,'admin',NULL,'安全管理部','2026-09-03 21:31:00.542','2026-09-03 21:31:00.542'),(2,NULL,'user','user123','普通员工',NULL,'user',NULL,'生产车间','2026-09-03 21:31:00.542','2026-09-03 21:31:00.542');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `workshops`
--

DROP TABLE IF EXISTS `workshops`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `workshops` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `code` varchar(16) NOT NULL,
  `name` varchar(64) NOT NULL,
  `location` varchar(128) DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `sort_order` int DEFAULT '0',
  `status` varchar(16) DEFAULT 'active',
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `factory_id` bigint DEFAULT '1',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_code` (`code`),
  KEY `idx_factory` (`factory_id`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `workshops`
--

LOCK TABLES `workshops` WRITE;
/*!40000 ALTER TABLE `workshops` DISABLE KEYS */;
INSERT INTO `workshops` VALUES (1,'WS-01','1号车间','A栋1层','生产线一区',1,'active','2026-09-03 21:31:00',1),(2,'WS-02','2号车间','A栋2层','生产线二区',2,'active','2026-09-03 21:31:00',1),(3,'WS-03','3号车间','B栋1层','仓储区',3,'active','2026-09-03 21:31:00',1),(4,'WS-04','4号车间','B栋2层','装配区',4,'active','2026-09-03 21:31:00',1);
/*!40000 ALTER TABLE `workshops` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Dumping routines for database 'factoryguard'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-09-03 23:08:26
