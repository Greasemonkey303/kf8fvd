CREATE TABLE IF NOT EXISTS maintenance_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  task_name VARCHAR(120) NOT NULL,
  status ENUM('ok', 'warning', 'failed') NOT NULL,
  command_text VARCHAR(255) NULL,
  summary TEXT NULL,
  error_text TEXT NULL,
  meta_json JSON NULL,
  runtime_ms INT UNSIGNED NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP NULL DEFAULT NULL,
  KEY idx_maintenance_runs_task_finished (task_name, finished_at),
  KEY idx_maintenance_runs_status_finished (status, finished_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;