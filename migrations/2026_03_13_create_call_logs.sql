-- Migration: create call_logs table for storing parsed ADIF/QSO entries
-- Run with your normal migration process (or apply to the database)

CREATE TABLE IF NOT EXISTS `call_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `entry_hash` VARCHAR(64) NOT NULL,
  `call` VARCHAR(64) NOT NULL,
  `qso_date` DATE DEFAULT NULL,
  `time_on` TIME DEFAULT NULL,
  `qso_datetime` DATETIME DEFAULT NULL,
  `band` VARCHAR(64) DEFAULT NULL,
  `frequency` VARCHAR(64) DEFAULT NULL,
  `mode` VARCHAR(64) DEFAULT NULL,
  `qth` VARCHAR(255) DEFAULT NULL,
  `city` VARCHAR(255) DEFAULT NULL,
  `state` VARCHAR(255) DEFAULT NULL,
  `country` VARCHAR(255) DEFAULT NULL,
  `lat` DOUBLE DEFAULT NULL,
  `lon` DOUBLE DEFAULT NULL,
  `raw_entry` LONGTEXT DEFAULT NULL,
  `adif_tags` JSON DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uq_calllogs_entry_hash` (`entry_hash`),
  INDEX `idx_calllogs_qso_datetime` (`qso_datetime`),
  INDEX `idx_calllogs_call` (`call`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
