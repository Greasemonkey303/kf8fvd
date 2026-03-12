-- Migration: add index on admin_actions(created_at)
-- Adds an index to speed ordering/pagination of the admin_actions table.
-- Apply with: node scripts/apply_migration.js migrations/2026_03_13_admin_actions_created_at_index.sql

ALTER TABLE `admin_actions`
  ADD INDEX `idx_admin_actions_created_at` (`created_at`);
