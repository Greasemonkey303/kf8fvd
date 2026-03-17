-- Migration: make admin_user_id nullable in admin_actions
-- Allows insertions where the actor is recorded as text (non-user)

ALTER TABLE `admin_actions`
  MODIFY COLUMN `admin_user_id` INT NULL;
