-- Create `onair` table and seed a default row
CREATE TABLE IF NOT EXISTS `onair` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `is_on` TINYINT(1) NOT NULL DEFAULT 0,
  `note` TEXT DEFAULT NULL,
  `updated_by` VARCHAR(128) DEFAULT NULL,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert a single default row if table is empty
INSERT INTO `onair` (`is_on`, `note`)
SELECT 0, 'initial seed' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `onair` LIMIT 1);

-- Query example to read state:
-- SELECT * FROM `onair` ORDER BY id ASC LIMIT 1;
