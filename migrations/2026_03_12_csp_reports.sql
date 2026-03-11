-- Migration: create csp_reports table to collect CSP violation reports
CREATE TABLE IF NOT EXISTS `csp_reports` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `document_uri` TEXT DEFAULT NULL,
  `referrer` TEXT DEFAULT NULL,
  `blocked_uri` VARCHAR(1024) DEFAULT NULL,
  `violated_directive` VARCHAR(255) DEFAULT NULL,
  `original_policy` TEXT DEFAULT NULL,
  `user_agent` VARCHAR(1024) DEFAULT NULL,
  `received_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `received_idx` (`received_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
