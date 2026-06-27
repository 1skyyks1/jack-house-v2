-- Qualifier ranking lock state.
-- Run after 2026-06-19-tournament-player-team-prep.sql.

ALTER TABLE `tournament`
  ADD COLUMN `qual_locked_at` DATETIME NULL COMMENT '资格赛排名锁定时间' AFTER `qual_end`,
  ADD COLUMN `qual_locked_by` INT NULL COMMENT '锁定资格赛排名的 user_id' AFTER `qual_locked_at`,
  ADD COLUMN `qual_locked_top_n` INT NULL COMMENT '锁定时的晋级名额' AFTER `qual_locked_by`;

CREATE INDEX `idx_tournament_qual_locked` ON `tournament` (`qual_locked_at`);
