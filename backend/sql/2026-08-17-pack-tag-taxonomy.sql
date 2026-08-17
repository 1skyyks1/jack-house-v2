-- Add first-class taxonomy and localized labels without changing existing tag IDs.
-- This migration intentionally never writes to pack_tags, so all existing pack/tag bindings remain intact.

ALTER TABLE `tag`
  ADD COLUMN IF NOT EXISTS `tag_key` VARCHAR(64) NULL AFTER `tag_name`,
  ADD COLUMN IF NOT EXISTS `category` VARCHAR(32) NULL AFTER `tag_key`,
  ADD COLUMN IF NOT EXISTS `name_zh` VARCHAR(255) NULL AFTER `category`,
  ADD COLUMN IF NOT EXISTS `name_en` VARCHAR(255) NULL AFTER `name_zh`,
  ADD COLUMN IF NOT EXISTS `sort_order` INT NOT NULL DEFAULT 0 AFTER `name_en`,
  ADD COLUMN IF NOT EXISTS `enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `sort_order`;

UPDATE `tag`
SET
  `tag_key` = COALESCE(NULLIF(`tag_key`, ''), CONCAT('tag-', `tag_id`)),
  `category` = COALESCE(NULLIF(`category`, ''), CASE
    WHEN `tag_id` BETWEEN 1 AND 7 THEN 'pattern'
    WHEN `tag_id` BETWEEN 8 AND 19 THEN 'bpm'
    ELSE 'difficulty'
  END),
  `name_zh` = COALESCE(NULLIF(`name_zh`, ''), `tag_name`),
  `name_en` = COALESCE(NULLIF(`name_en`, ''), `tag_name`),
  `sort_order` = CASE
    WHEN `sort_order` > 0 THEN `sort_order`
    WHEN `tag_id` BETWEEN 1 AND 7 THEN `tag_id` * 10
    WHEN `tag_id` BETWEEN 8 AND 19 THEN (`tag_id` - 7) * 10
    ELSE (`tag_id` - 19) * 10
  END;

UPDATE `tag` SET `tag_key` = 'full-jack', `name_zh` = '满叠', `name_en` = 'Full Jack' WHERE `tag_id` = 1;
UPDATE `tag` SET `tag_key` = 'dense-jack', `name_zh` = '大叠', `name_en` = 'Dense Jack' WHERE `tag_id` = 2;
UPDATE `tag` SET `tag_key` = 'middle-jack', `name_zh` = '中叠', `name_en` = 'Middle Jack' WHERE `tag_id` = 3;
UPDATE `tag` SET `tag_key` = 'light-jack', `name_zh` = '小叠', `name_en` = 'Light Jack' WHERE `tag_id` = 4;
UPDATE `tag` SET `tag_key` = 'anchor-jack', `name_zh` = '纵叠', `name_en` = 'Anchor Jack' WHERE `tag_id` = 5;
UPDATE `tag` SET `tag_key` = 'quad-stream', `name_zh` = '四押切', `name_en` = 'QuadStream' WHERE `tag_id` = 6;
UPDATE `tag` SET `tag_key` = 'mini-jack', `name_zh` = '子弹叠', `name_en` = 'MiniJack' WHERE `tag_id` = 7;

ALTER TABLE `tag`
  MODIFY COLUMN `tag_key` VARCHAR(64) NOT NULL,
  MODIFY COLUMN `category` VARCHAR(32) NOT NULL,
  MODIFY COLUMN `name_zh` VARCHAR(255) NOT NULL,
  MODIFY COLUMN `name_en` VARCHAR(255) NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS `uq_tag_key` ON `tag` (`tag_key`);
CREATE INDEX IF NOT EXISTS `idx_tag_category_enabled_sort` ON `tag` (`category`, `enabled`, `sort_order`);
