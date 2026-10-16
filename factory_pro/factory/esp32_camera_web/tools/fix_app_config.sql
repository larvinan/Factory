-- 修复 app_config 描述字段（SET NAMES 保证 utf8mb4）
USE factoryguard;
SET NAMES utf8mb4;
UPDATE app_config SET description = '温度告警阈值(℃)' WHERE config_key = 'temperature_high';
UPDATE app_config SET description = '可燃气报警阈值(ppm)' WHERE config_key = 'mq5_ppm_high';
UPDATE app_config SET description = '烟雾报警阈值(ppm)' WHERE config_key = 'mq2_ppm_high';
SELECT config_key, config_value, description FROM app_config;
