CREATE TABLE IF NOT EXISTS content_deletion_log (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  content_type VARCHAR(100) NOT NULL,
  original_id BIGINT NULL,
  slug VARCHAR(255) NULL,
  snapshot_json LONGTEXT NOT NULL,
  original_object_keys JSON NULL,
  archived_object_keys JSON NULL,
  deleted_by VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_content_deletion_log_type_created_at (content_type, created_at),
  KEY idx_content_deletion_log_original (content_type, original_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;