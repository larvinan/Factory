-- ============================================================
-- V3 多工厂管理迁移脚本
-- 层级：工厂 factories → 车间 workshops（factory_id）→ 设备 devices（workshop_id）
-- 幂等性：建表 IF NOT EXISTS / 种子 INSERT IGNORE / 加列前无需判断（重复执行报 Duplicate 可忽略）
-- ============================================================

-- 1. 工厂表
CREATE TABLE IF NOT EXISTS factories (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  address VARCHAR(255),
  manager VARCHAR(64),
  phone VARCHAR(32),
  sort_order INT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. 默认工厂（存量车间/设备自动归属）
INSERT IGNORE INTO factories (code, name, address, manager, sort_order) VALUES
('F-01', '第一工厂', '总部园区A区', '默认工厂', 1);

-- 3. 车间归属工厂
ALTER TABLE workshops ADD COLUMN factory_id BIGINT DEFAULT 1;
ALTER TABLE workshops ADD INDEX idx_factory (factory_id);

-- 存量车间全部归入第一工厂
UPDATE workshops SET factory_id = 1 WHERE factory_id IS NULL;
