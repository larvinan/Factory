-- ============================================================
-- V4 反馈服务迁移脚本
-- 反馈闭环：提交（分类/严重度/截图/联系方式）→ 状态流转 → 回复
-- 状态：pending 待处理 / processing 处理中 / resolved 已解决 / closed 已关闭
-- ============================================================

CREATE TABLE IF NOT EXISTS feedbacks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  type VARCHAR(16) NOT NULL DEFAULT 'bug',
  severity VARCHAR(16) DEFAULT 'medium',
  title VARCHAR(128) NOT NULL,
  content TEXT NOT NULL,
  contact VARCHAR(64),
  images VARCHAR(1024),
  status VARCHAR(16) DEFAULT 'pending',
  reply TEXT,
  handled_by VARCHAR(64),
  handled_at DATETIME,
  reporter_type VARCHAR(16),
  reporter_id VARCHAR(64),
  reporter_name VARCHAR(64),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_reporter (reporter_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
