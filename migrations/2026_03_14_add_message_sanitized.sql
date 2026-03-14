-- Add a sanitized HTML column to messages to store server-sanitized HTML for safe rendering
ALTER TABLE messages
  ADD COLUMN message_sanitized TEXT NULL;
