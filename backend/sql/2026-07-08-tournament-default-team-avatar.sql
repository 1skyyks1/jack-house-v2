ALTER TABLE `tournament`
  ADD COLUMN `default_team_avatar` VARCHAR(255) NULL COMMENT '默认队旗' AFTER `banner`;
