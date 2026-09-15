-- 投稿审稿人内部评论表
CREATE TABLE IF NOT EXISTS `post_file_comment` (
  `comment_id` INT NOT NULL AUTO_INCREMENT,
  `file_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `comment` TEXT NOT NULL,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`comment_id`),
  KEY `idx_post_file_comment_file` (`file_id`),
  KEY `idx_post_file_comment_user` (`user_id`),
  CONSTRAINT `fk_post_file_comment_file` FOREIGN KEY (`file_id`) REFERENCES `post_file` (`file_id`) ON DELETE CASCADE,
  CONSTRAINT `fk_post_file_comment_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
