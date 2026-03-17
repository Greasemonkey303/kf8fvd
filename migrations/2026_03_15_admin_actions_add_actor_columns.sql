-- Migration: add actor, actor_type, reason, ip, meta columns to admin_actions
-- and add composite indexes used by admin audit queries
-- Safe to re-run on MySQL 8+ (uses IF NOT EXISTS for columns)

ALTER TABLE `admin_actions`
  ADD COLUMN `actor` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN `actor_type` VARCHAR(100) DEFAULT NULL,
  ADD COLUMN `reason` VARCHAR(255) DEFAULT NULL,
  ADD COLUMN `ip` VARCHAR(45) DEFAULT NULL,
  ADD COLUMN `meta` TEXT DEFAULT NULL;

-- Add composite indexes for common admin queries
ALTER TABLE `admin_actions`
  ADD INDEX `idx_admin_actions_action_created_at` (`action`, `created_at`),
  ADD INDEX `idx_admin_actions_actor_created_at` (`actor`, `created_at`);
