ALTER TABLE `content_deletion_log`
  ADD COLUMN `cleanup_status` ENUM('pending', 'complete', 'cancelled') NOT NULL DEFAULT 'pending' AFTER `deleted_by`,
  ADD COLUMN `cleanup_attempted_at` DATETIME NULL AFTER `cleanup_status`,
  ADD COLUMN `cleanup_completed_at` DATETIME NULL AFTER `cleanup_attempted_at`,
  ADD COLUMN `cleanup_error` VARCHAR(1000) NULL AFTER `cleanup_completed_at`,
  ADD KEY `idx_content_deletion_cleanup` (`cleanup_status`, `created_at`);
