-- Run before deploying the bounty-enabled backend. MariaDB / InnoDB.
-- Safe to run repeatedly; no existing post types or content are changed.
ALTER TABLE `post` ADD COLUMN IF NOT EXISTS `bounty_closed_at` DATETIME NULL COMMENT '悬赏手动结束时间';
CREATE INDEX IF NOT EXISTS `idx_post_bounty_active` ON `post` (`type`, `bounty_closed_at`, `end`);
CREATE TABLE IF NOT EXISTS `post_pack` (
    `post_id` INT NOT NULL,
    `pack_id` INT NOT NULL,
    PRIMARY KEY (`post_id`, `pack_id`),
    KEY `idx_post_pack_pack` (`pack_id`, `post_id`),
    CONSTRAINT `fk_post_pack_post` FOREIGN KEY (`post_id`) REFERENCES `post` (`post_id`) ON DELETE CASCADE,
    CONSTRAINT `fk_post_pack_pack` FOREIGN KEY (`pack_id`) REFERENCES `pack` (`pack_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
