-- Create projects table for dynamic Projects page
CREATE TABLE IF NOT EXISTS `projects` (
  `id` int unsigned NOT NULL AUTO_INCREMENT,
  `slug` varchar(255) NOT NULL UNIQUE,
  `title` varchar(255) NOT NULL,
  `subtitle` varchar(255) DEFAULT NULL,
  `image_path` varchar(1024) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `external_link` varchar(1024) DEFAULT NULL,
  `metadata` json DEFAULT (JSON_OBJECT()),
  `is_published` tinyint(1) NOT NULL DEFAULT 0,
  `sort_order` int NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed example hotspot project (image references existing public/hotspot files)
INSERT INTO projects (slug, title, subtitle, image_path, description, external_link, is_published, sort_order)
VALUES
('hotspot', 'Hotspot Project', 'Raspberry Pi 4 + MMDVM Hotspot', '/hotspot/hotspot-2.jpg', 'This project documents building a compact local amateur radio hotspot using a Raspberry Pi 4 and an MMDVM HAT. Click the image to view it full-size.', '/projects/hotspot', 1, 1)
ON DUPLICATE KEY UPDATE title=VALUES(title);
