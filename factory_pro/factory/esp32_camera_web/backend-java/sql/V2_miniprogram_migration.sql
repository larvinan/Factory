-- ============================================================
-- 小程序端移植迁移脚本：车间管理 / 巡检任务 / 报告导出支撑表
-- 来源：factory_first 项目，适配 factoryguard 新库
-- 幂等性：建表用 IF NOT EXISTS；种子数据用 INSERT IGNORE
-- ============================================================

-- 1. 车间表
CREATE TABLE IF NOT EXISTS workshops (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(16) NOT NULL,
  name VARCHAR(64) NOT NULL,
  location VARCHAR(128),
  description VARCHAR(255),
  sort_order INT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO workshops (code, name, location, description, sort_order) VALUES
('WS-01', '1号车间', 'A栋1层', '生产线一区', 1),
('WS-02', '2号车间', 'A栋2层', '生产线二区', 2),
('WS-03', '3号车间', 'B栋1层', '仓储区', 3),
('WS-04', '4号车间', 'B栋2层', '装配区', 4);

-- 2. 巡检任务表
CREATE TABLE IF NOT EXISTS inspection_tasks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  workshop_id BIGINT DEFAULT 1,
  title VARCHAR(128) NOT NULL,
  description VARCHAR(255),
  inspector_openid VARCHAR(64),
  inspector_name VARCHAR(64),
  status VARCHAR(16) DEFAULT 'pending',
  priority VARCHAR(16) DEFAULT 'normal',
  scheduled_date DATE,
  due_date DATE,
  items_json JSON,
  result_note TEXT,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_workshop (workshop_id),
  INDEX idx_status (status),
  INDEX idx_inspector (inspector_openid),
  INDEX idx_scheduled (scheduled_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO inspection_tasks (workshop_id, title, description, inspector_name, status, priority, scheduled_date, due_date, items_json) VALUES
(1, '1号车间日常安全巡检', '检查温湿度设备运行状态、燃气泄漏、消防通道畅通', '张三', 'assigned', 'high', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 DAY), '[{"item":"温湿度设备运行状态","required":true},{"item":"燃气管道密封性","required":true},{"item":"消防通道畅通","required":true}]'),
(1, '1号车间设备点检', '检查继电器输出、蜂鸣器、RGB 指示灯功能正常', '李四', 'pending', 'normal', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 2 DAY), '[{"item":"继电器输出通断测试","required":true},{"item":"蜂鸣器鸣响测试","required":true},{"item":"RGB 指示灯颜色切换","required":false}]'),
(2, '2号车间环境巡检', '检查温湿度及通风设备', NULL, 'pending', 'normal', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 DAY), '[{"item":"温湿度传感器校准","required":true},{"item":"通风设备运行","required":true}]'),
(3, '3号车间消防专项巡检', '检查烟雾浓度监测及消防设施', '王五', 'in_progress', 'urgent', CURDATE(), CURDATE(), '[{"item":"烟雾传感器灵敏度","required":true},{"item":"灭火器压力","required":true},{"item":"消防通道畅通","required":true}]');

-- 3. 巡检点位表（扫码打卡用）
CREATE TABLE IF NOT EXISTS inspection_points (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  workshop_id BIGINT DEFAULT 1,
  code VARCHAR(32) NOT NULL,
  name VARCHAR(64) NOT NULL,
  location VARCHAR(128),
  qr_content VARCHAR(255),
  sort_order INT DEFAULT 0,
  required TINYINT DEFAULT 1,
  status VARCHAR(16) DEFAULT 'active',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_code (code),
  INDEX idx_workshop (workshop_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO inspection_points (workshop_id, code, name, location, qr_content, sort_order, required) VALUES
(1, 'PT-101', '温湿度监测点', '1号车间东侧', 'PT-101', 1, 1),
(1, 'PT-102', '燃气监测点', '1号车间燃气管线区', 'PT-102', 2, 1),
(1, 'PT-103', '消防通道A', '1号车间北门', 'PT-103', 3, 1),
(1, 'PT-104', '控制柜', '1号车间配电室', 'PT-104', 4, 0),
(2, 'PT-201', '环境监测点', '2号车间中区', 'PT-201', 1, 1),
(2, 'PT-202', '通风设备', '2号车间西侧', 'PT-202', 2, 1),
(3, 'PT-301', '烟雾监测点', '3号车间仓储区', 'PT-301', 1, 1),
(3, 'PT-302', '消防器材柜', '3号车间入口', 'PT-302', 2, 1);

-- 4. 巡检打卡记录表
CREATE TABLE IF NOT EXISTS inspection_checkins (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_id BIGINT NOT NULL,
  point_id BIGINT,
  point_code VARCHAR(32),
  point_name VARCHAR(64),
  inspector_name VARCHAR(64),
  checkin_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  remark VARCHAR(255),
  INDEX idx_task (task_id),
  INDEX idx_point (point_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. 业务表关联车间（幂等：先查列再添加，重复执行会报 Duplicate column 可忽略）
ALTER TABLE devices ADD COLUMN workshop_id BIGINT DEFAULT 1;
ALTER TABLE alerts ADD COLUMN workshop_id BIGINT DEFAULT 1;
ALTER TABLE hazards ADD COLUMN workshop_id BIGINT DEFAULT 1;
