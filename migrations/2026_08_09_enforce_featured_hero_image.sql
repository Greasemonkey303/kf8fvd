UPDATE `hero_image` AS image
JOIN (
  SELECT `hero_id`, MAX(`id`) AS `keep_id`
  FROM `hero_image`
  WHERE `is_featured` = 1
  GROUP BY `hero_id`
  HAVING COUNT(*) > 1
) AS duplicate ON duplicate.`hero_id` = image.`hero_id`
SET image.`is_featured` = 0
WHERE image.`is_featured` = 1 AND image.`id` <> duplicate.`keep_id`;

DELETE image
FROM `hero_image` AS image
LEFT JOIN `hero` ON `hero`.`id` = image.`hero_id`
WHERE `hero`.`id` IS NULL;

ALTER TABLE `hero_image`
  ADD COLUMN `featured_hero_id` INT NULL AFTER `is_featured`;

UPDATE `hero_image`
SET `featured_hero_id` = CASE WHEN `is_featured` = 1 THEN `hero_id` ELSE NULL END;

ALTER TABLE `hero_image`
  ADD UNIQUE KEY `uq_hero_image_featured_hero` (`featured_hero_id`),
  ADD CONSTRAINT `chk_hero_image_featured_marker` CHECK (
    (`is_featured` = 1 AND `featured_hero_id` = `hero_id`)
    OR (`is_featured` = 0 AND `featured_hero_id` IS NULL)
  );
