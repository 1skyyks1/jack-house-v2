CREATE TABLE IF NOT EXISTS `t_mappool_stats` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `t_id` INT NOT NULL COMMENT '赛事id',
  `stage` VARCHAR(16) NOT NULL COMMENT 'ro32/ro16/qf/sf/f/gf',
  `match_count` INT NOT NULL DEFAULT 0,
  `completed_match_count` INT NOT NULL DEFAULT 0,
  `valid_match_count` INT NOT NULL DEFAULT 0,
  `stats_json` LONGTEXT NOT NULL COMMENT '已发布的图池统计快照',
  `calculated_by` INT NULL COMMENT '计算统计的 user_id',
  `calculated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_t_mappool_stats_tournament_stage` (`t_id`, `stage`),
  KEY `idx_t_mappool_stats_tournament_calculated` (`t_id`, `calculated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
