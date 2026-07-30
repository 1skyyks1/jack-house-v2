ALTER TABLE `t_game`
  ADD COLUMN IF NOT EXISTS `player1_miss_count` INT UNSIGNED NULL COMMENT 'team1选手实际 miss 数；NULL=未知' AFTER `player1_score`,
  ADD COLUMN IF NOT EXISTS `player2_miss_count` INT UNSIGNED NULL COMMENT 'team2选手实际 miss 数；NULL=未知' AFTER `player2_score`;
