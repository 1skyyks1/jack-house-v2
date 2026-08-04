-- Store user reports and feedback attached to a pack.

CREATE TABLE IF NOT EXISTS `pack_feedback` (
  `feedback_id` INT NOT NULL AUTO_INCREMENT,
  `pack_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `category` VARCHAR(32) NOT NULL,
  `content` TEXT NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=pending, 1=resolved, 2=dismissed',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`feedback_id`),
  KEY `idx_pack_feedback_pack_status` (`pack_id`, `status`),
  KEY `idx_pack_feedback_user` (`user_id`),
  CONSTRAINT `fk_pack_feedback_pack` FOREIGN KEY (`pack_id`) REFERENCES `pack` (`pack_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_pack_feedback_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
