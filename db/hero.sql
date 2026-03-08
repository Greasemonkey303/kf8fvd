-- SQL schema for dynamic homepage hero and hero images
-- Run this in MySQL (Workbench) to create the tables and sample rows.

CREATE TABLE IF NOT EXISTS `hero` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `title` VARCHAR(255) NOT NULL,
  `subtitle` VARCHAR(255) DEFAULT NULL,
  `content` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `hero_image` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `hero_id` INT NOT NULL,
  `url` VARCHAR(1024) NOT NULL,
  `alt` VARCHAR(255) DEFAULT NULL,
  `is_featured` TINYINT(1) NOT NULL DEFAULT 0,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX (`hero_id`),
  CONSTRAINT `fk_hero_image_hero` FOREIGN KEY (`hero_id`) REFERENCES `hero`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert an initial hero row
INSERT INTO `hero` (`title`, `subtitle`, `content`)
VALUES
('Welcome to KF8FVD', 'Amateur radio, projects, and logbook', '<p>Welcome — this is my personal site and logbook. Stay tuned for updates.</p>');

-- Assuming the inserted hero has id=1, insert sample images
INSERT INTO `hero_image` (`hero_id`, `url`, `alt`, `is_featured`, `sort_order`)
VALUES
(1, '/uploads/hero1.jpg', 'Station in the field', 1, 0),
(1, '/uploads/hero2.jpg', 'Antenna at sunrise', 0, 1),
(1, '/uploads/hero3.jpg', 'Portable setup', 0, 2);

-- Example: switch featured image (replace 2 with target image id)
-- UPDATE hero_image SET is_featured = 0 WHERE hero_id = 1;
-- UPDATE hero_image SET is_featured = 1 WHERE id = 2;

-- Helpful select queries
-- Show hero with images (featured first)
-- SELECT h.*, hi.* FROM hero h LEFT JOIN hero_image hi ON hi.hero_id = h.id WHERE h.id = 1 ORDER BY hi.is_featured DESC, hi.sort_order ASC;

-- Optional: keep only a single featured image per hero (trigger-like behavior)
-- You can enforce via application logic: when setting one image `is_featured=1`, unset others for that hero.
