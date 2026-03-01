-- Seed data for `projects` table
-- Safe to run multiple times: uses ON DUPLICATE KEY UPDATE to avoid duplicates

INSERT INTO projects (slug, title, subtitle, image_path, description, external_link, is_published, sort_order, created_at)
VALUES
('hotspot', 'Hotspot Project', 'Raspberry Pi 4 + MMDVM Hotspot', '/hotspot/hotspot-2.jpg', 'This project documents building a compact local amateur radio hotspot using a Raspberry Pi 4 and an MMDVM HAT. Click the image to view it full-size.', '/projects/hotspot', 1, 1, NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  image_path = VALUES(image_path),
  description = VALUES(description),
  external_link = VALUES(external_link),
  is_published = VALUES(is_published),
  sort_order = VALUES(sort_order),
  updated_at = NOW();

-- Placeholder for additional projects visible on the front-end
INSERT INTO projects (slug, title, subtitle, image_path, description, external_link, is_published, sort_order, created_at)
VALUES
('other-projects', 'Other Projects', 'More to come', NULL, 'Additional projects will appear here. This page focuses on the Hotspot — follow the link above.', NULL, 0, 99, NOW())
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  subtitle = VALUES(subtitle),
  description = VALUES(description),
  sort_order = VALUES(sort_order),
  updated_at = NOW();
