ALTER TABLE `t_game`
  ADD COLUMN IF NOT EXISTS `mp_game_id` BIGINT NULL COMMENT 'osu! multiplayer game id' AFTER `id`,
  ADD COLUMN IF NOT EXISTS `played_at` DATETIME NULL COMMENT 'MP game 实际开始时间' AFTER `mp_game_id`;

CREATE TABLE IF NOT EXISTS `t_tournament_rating_snapshot` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `t_id` INT NOT NULL COMMENT '赛事 id；每届赛事只保留一份已发布快照',
  `model_version` VARCHAR(32) NOT NULL,
  `parameters_json` LONGTEXT NOT NULL,
  `source_hash` CHAR(64) NOT NULL COMMENT '参与计算的 game 数据指纹',
  `game_count` INT NOT NULL DEFAULT 0,
  `player_count` INT NOT NULL DEFAULT 0,
  `calculated_by` INT NULL,
  `calculated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_final` TINYINT NOT NULL DEFAULT 0,
  `finalized_by` INT NULL,
  `finalized_at` DATETIME NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tournament_rating_snapshot_tournament` (`t_id`),
  KEY `idx_tournament_rating_snapshot_calculated` (`calculated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `t_tournament_player_rating` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `snapshot_id` INT NOT NULL,
  `t_id` INT NOT NULL,
  `player_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `team_id` INT NULL,
  `tournament_rating` DECIMAL(12,3) NOT NULL,
  `rating_delta` DECIMAL(12,3) NOT NULL,
  `average_jpp` DECIMAL(12,3) NOT NULL,
  `best_jpp` DECIMAL(12,3) NOT NULL,
  `game_count` INT NOT NULL DEFAULT 0,
  `win_count` INT NOT NULL DEFAULT 0,
  `reliability` VARCHAR(16) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tournament_player_rating_snapshot_player` (`snapshot_id`, `player_id`),
  KEY `idx_tournament_player_rating_rank` (`snapshot_id`, `tournament_rating`),
  KEY `idx_tournament_player_rating_user` (`user_id`, `t_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `t_tournament_play_performance` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `snapshot_id` INT NOT NULL,
  `t_id` INT NOT NULL,
  `game_id` INT NOT NULL,
  `match_id` INT NOT NULL,
  `map_id` INT NOT NULL,
  `player_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `opponent_player_id` INT NOT NULL,
  `opponent_user_id` INT NOT NULL,
  `side` TINYINT NOT NULL,
  `sequence_no` INT NOT NULL,
  `score` INT NOT NULL,
  `opponent_score` INT NOT NULL,
  `won` TINYINT NOT NULL,
  `jpp` DECIMAL(12,3) NOT NULL,
  `absolute_component` DECIMAL(12,3) NOT NULL,
  `match_component` DECIMAL(12,3) NOT NULL,
  `absolute_weight` DECIMAL(8,6) NOT NULL,
  `rating_before` DECIMAL(12,3) NOT NULL,
  `rating_delta` DECIMAL(12,3) NOT NULL,
  `rating_after` DECIMAL(12,3) NOT NULL,
  `reliability` VARCHAR(16) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_tournament_play_performance_snapshot_game_player` (`snapshot_id`, `game_id`, `player_id`),
  KEY `idx_tournament_play_performance_player_sequence` (`snapshot_id`, `player_id`, `sequence_no`),
  KEY `idx_tournament_play_performance_game` (`game_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
