-- Replace referee roll point storage with a single roll winner team id.
-- This migration intentionally does not backfill from old roll point values.

ALTER TABLE `t_match`
  ADD COLUMN `roll_winner_id` INT NULL COMMENT 'Roll胜方队伍id' AFTER `team2_id`,
  DROP COLUMN `team1_roll`,
  DROP COLUMN `team2_roll`;
