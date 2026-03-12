-- Migration: add composite indexes on admin_actions to speed filters and pagination
-- Apply with your usual migration runner, or run manually:
--   ALTER TABLE `admin_actions` ADD INDEX `idx_admin_actions_action_created_at` (`action`, `created_at`);
--   ALTER TABLE `admin_actions` ADD INDEX `idx_admin_actions_actor_created_at` (`actor`, `created_at`);

ALTER TABLE `admin_actions`
  ADD INDEX `idx_admin_actions_action_created_at` (`action`, `created_at`),
  ADD INDEX `idx_admin_actions_actor_created_at` (`actor`, `created_at`);
