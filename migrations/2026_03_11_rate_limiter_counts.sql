-- Migration: create table to support DB-backed rate-limiter fallback
CREATE TABLE IF NOT EXISTS `rate_limiter_counts` (
  `key_name` VARCHAR(255) NOT NULL,
  `count` BIGINT NOT NULL DEFAULT 0,
  `expires_at` DATETIME NOT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`key_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
