-- 创建全站通知表
CREATE TABLE IF NOT EXISTS `notice` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `content_zh` TEXT NOT NULL COMMENT '中文富文本通知内容',
  `content_en` TEXT NOT NULL COMMENT '英文富文本通知内容',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否启用展示（1=启用，0=停用）',
  `active_slot` TINYINT(1) AS (CASE WHEN `is_active` = 1 THEN 1 ELSE NULL END) STORED COMMENT '保证同时只有一条启用通知',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY `uq_notice_single_active` (`active_slot`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='全站重要通知表';

-- 兼容已经创建过旧结构的环境：仅保留最新启用通知，再补充唯一约束。
UPDATE `notice`
SET `is_active` = 0
WHERE `is_active` = 1
  AND `id` <> (
    SELECT `latest_id`
    FROM (SELECT MAX(`id`) AS `latest_id` FROM `notice` WHERE `is_active` = 1) AS `latest`
  );

ALTER TABLE `notice`
  ADD COLUMN IF NOT EXISTS `active_slot` TINYINT(1)
  AS (CASE WHEN `is_active` = 1 THEN 1 ELSE NULL END) STORED
  COMMENT '保证同时只有一条启用通知';

CREATE UNIQUE INDEX IF NOT EXISTS `uq_notice_single_active` ON `notice` (`active_slot`);
