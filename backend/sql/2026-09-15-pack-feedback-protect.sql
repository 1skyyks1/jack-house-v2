-- 保护图包反馈：允许 pack_id 为 NULL，外键改为 ON DELETE SET NULL，增加图包名快照
ALTER TABLE `pack_feedback`
  MODIFY COLUMN `pack_id` INT NULL;

-- 增加图包名称快照字段（如果不存在）
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pack_feedback' AND COLUMN_NAME = 'pack_title_snapshot'
);
SET @stmt = IF(@col_exists = 0, 'ALTER TABLE `pack_feedback` ADD COLUMN `pack_title_snapshot` VARCHAR(255) NULL COMMENT \'图包标题快照\' AFTER `pack_id`', 'SELECT 1');
PREPARE add_col FROM @stmt;
EXECUTE add_col;
DEALLOCATE PREPARE add_col;

-- 回填现有图包名称快照
UPDATE `pack_feedback` f
JOIN `pack` p ON f.pack_id = p.pack_id
SET f.pack_title_snapshot = p.title
WHERE f.pack_title_snapshot IS NULL;

-- 重建外键约束为 ON DELETE SET NULL
SET @fk_exists = (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'pack_feedback' AND CONSTRAINT_NAME = 'fk_pack_feedback_pack'
);
SET @stmt = IF(@fk_exists > 0, 'ALTER TABLE `pack_feedback` DROP FOREIGN KEY `fk_pack_feedback_pack`', 'SELECT 1');
PREPARE drop_fk FROM @stmt;
EXECUTE drop_fk;
DEALLOCATE PREPARE drop_fk;

ALTER TABLE `pack_feedback`
  ADD CONSTRAINT `fk_pack_feedback_pack` FOREIGN KEY (`pack_id`) REFERENCES `pack` (`pack_id`) ON DELETE SET NULL;
