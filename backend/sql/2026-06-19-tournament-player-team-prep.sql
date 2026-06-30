-- Tournament player/team model preparation.
-- Run manually after backing up the database.
-- The statements are written for MariaDB/MySQL and should be reviewed against the live schema first.

ALTER TABLE `t_player`
  ADD COLUMN `t_id` INT NULL COMMENT '赛事id，冗余自 team.t_id，用于同赛事唯一校验和查询' AFTER `team_id`,
  ADD COLUMN `user_name_snapshot` VARCHAR(255) NULL COMMENT '报名时用户名快照' AFTER `user_id`,
  ADD COLUMN `avatar_snapshot` VARCHAR(1024) NULL COMMENT '报名时头像快照' AFTER `user_name_snapshot`,
  ADD COLUMN `contact_qq` VARCHAR(64) NULL COMMENT '赛事联系方式 QQ' AFTER `avatar_snapshot`,
  ADD COLUMN `contact_discord` VARCHAR(128) NULL COMMENT '赛事联系方式 Discord' AFTER `contact_qq`,
  ADD COLUMN `timezone` VARCHAR(64) NULL COMMENT '选手时区' AFTER `contact_discord`,
  ADD COLUMN `remark` TEXT NULL COMMENT '报名备注' AFTER `timezone`,
  ADD COLUMN `review_status` VARCHAR(32) NOT NULL DEFAULT 'review_pending' COMMENT 'review_pending/review_passed/review_failed' AFTER `remark`;

UPDATE `t_player` p
JOIN `t_team` t ON t.`id` = p.`team_id`
LEFT JOIN `user` u ON u.`user_id` = p.`user_id`
SET
  p.`t_id` = t.`t_id`,
  p.`user_name_snapshot` = COALESCE(p.`user_name_snapshot`, u.`user_name`),
  p.`avatar_snapshot` = COALESCE(p.`avatar_snapshot`, u.`avatar`),
  p.`contact_qq` = COALESCE(p.`contact_qq`, u.`qq`),
  p.`contact_discord` = COALESCE(p.`contact_discord`, u.`discord`);

-- Enable this after verifying every existing player row has a valid team.
-- ALTER TABLE `t_player`
--   MODIFY COLUMN `t_id` INT NOT NULL COMMENT '赛事id，冗余自 team.t_id，用于同赛事唯一校验和查询';

CREATE INDEX `idx_t_player_team_user` ON `t_player` (`team_id`, `user_id`);
CREATE INDEX `idx_t_player_review_status` ON `t_player` (`review_status`);

-- 报名期退队会物理删除旧 player 记录，因此用唯一约束强化“同一赛事同一用户只能有一个有效 player”。
ALTER TABLE `t_player`
  ADD UNIQUE KEY `uk_t_player_tid_user` (`t_id`, `user_id`);

ALTER TABLE `t_team`
  ADD COLUMN `avatar` VARCHAR(1024) NULL COMMENT '队伍头像，第一版可预留' AFTER `invite_code`,
  ADD COLUMN `is_open` TINYINT NOT NULL DEFAULT 0 COMMENT '是否开放组队' AFTER `avatar`,
  ADD COLUMN `captain_player_id` INT NULL COMMENT '队长player_id，长期队长关系以此字段为准' AFTER `captain_id`,
  ADD COLUMN `locked_at` DATETIME NULL COMMENT '队伍锁定时间' AFTER `qual_score`;

UPDATE `t_team` t
LEFT JOIN `t_player` p
  ON p.`team_id` = t.`id`
 AND p.`user_id` = t.`captain_id`
 AND p.`is_captain` = 1
SET t.`captain_player_id` = p.`id`
WHERE t.`captain_player_id` IS NULL;

CREATE INDEX `idx_t_team_captain_player` ON `t_team` (`captain_player_id`);
CREATE INDEX `idx_t_team_open` ON `t_team` (`t_id`, `is_open`);

ALTER TABLE `tournament`
  ADD COLUMN `created_by` INT NULL COMMENT '创建者 user_id；creator host 可删除赛事和添加其他 host' AFTER `status`;

-- For existing tournaments, pick one existing host as creator if possible.
UPDATE `tournament` t
LEFT JOIN (
  SELECT `t_id`, MIN(`user_id`) AS `creator_user_id`
  FROM `t_staff`
  WHERE `role` = 'host'
  GROUP BY `t_id`
) h ON h.`t_id` = t.`id`
SET t.`created_by` = h.`creator_user_id`
WHERE t.`created_by` IS NULL;

CREATE INDEX `idx_tournament_created_by` ON `tournament` (`created_by`);

ALTER TABLE `t_match`
  MODIFY COLUMN `team1_id` INT NULL COMMENT '红队，预生成 bracket 来源未决时可为空',
  ADD COLUMN `result_type` VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT 'normal/wbd/ff' AFTER `winner_id`,
  ADD COLUMN `result_note` TEXT NULL COMMENT 'WBD/FF 或手动改判备注' AFTER `result_type`,
  ADD COLUMN `winner_overridden` TINYINT NOT NULL DEFAULT 0 COMMENT '胜方是否由 referee 手动修改' AFTER `result_note`,
  ADD COLUMN `bracket_group` VARCHAR(32) NULL COMMENT 'winner/loser/grand_final/reset_final' AFTER `is_possible`,
  ADD COLUMN `round_no` INT NULL COMMENT '同 bracket group 内轮次序号' AFTER `bracket_group`,
  ADD COLUMN `slot_no` INT NULL COMMENT '同轮次内位置' AFTER `round_no`,
  ADD COLUMN `source_match_1_id` INT NULL COMMENT '队伍1来源比赛' AFTER `slot_no`,
  ADD COLUMN `source_match_1_result` VARCHAR(16) NULL COMMENT 'winner/loser' AFTER `source_match_1_id`,
  ADD COLUMN `source_match_2_id` INT NULL COMMENT '队伍2来源比赛' AFTER `source_match_1_result`,
  ADD COLUMN `source_match_2_result` VARCHAR(16) NULL COMMENT 'winner/loser' AFTER `source_match_2_id`,
  ADD COLUMN `hidden_until_match_id` INT NULL COMMENT '隐藏到指定比赛完成后再展示' AFTER `source_match_2_result`;

CREATE INDEX `idx_t_match_result_type` ON `t_match` (`result_type`);
CREATE INDEX `idx_t_match_bracket_slot` ON `t_match` (`bracket_group`, `round_no`, `slot_no`);

ALTER TABLE `t_mappool`
  ADD UNIQUE KEY `uk_t_mappool_round_map` (`round_id`, `map_id`);

CREATE INDEX `idx_t_mappool_round_type` ON `t_mappool` (`round_id`, `type`);

CREATE TABLE `t_match_action` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `match_id` INT NOT NULL COMMENT '比赛id',
  `action_type` VARCHAR(32) NOT NULL COMMENT 'roll/protect/ban/pick/score_import/score_edit/timeout/note',
  `team_id` INT NULL COMMENT '执行队伍id',
  `map_id` INT NULL COMMENT '关联正赛图池id',
  `value_json` TEXT NULL COMMENT '操作扩展数据 JSON',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '时间线顺序',
  `created_by` INT NULL COMMENT '操作者 user_id',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_t_match_action_match_order` (`match_id`, `sort_order`),
  KEY `idx_t_match_action_match_type` (`match_id`, `action_type`),
  KEY `idx_t_match_action_map` (`map_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `t_qual_import` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `t_id` INT NOT NULL COMMENT '赛事id',
  `team_id` INT NOT NULL COMMENT '队伍id',
  `mp_id` INT NOT NULL COMMENT 'osu MP房间id',
  `status` VARCHAR(32) NOT NULL DEFAULT 'running' COMMENT 'running/success/failed',
  `message` TEXT NULL COMMENT '导入消息或失败原因',
  `imported_by` INT NULL COMMENT '导入者 user_id',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_t_qual_import_tid_team` (`t_id`, `team_id`),
  KEY `idx_t_qual_import_mp` (`mp_id`),
  KEY `idx_t_qual_import_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `t_qual_mappool`
  ADD UNIQUE KEY `uk_t_qual_mappool_tid_stage` (`t_id`, `index`),
  ADD UNIQUE KEY `uk_t_qual_mappool_tid_map` (`t_id`, `map_id`);

ALTER TABLE `t_qual_score`
  ADD COLUMN `attempt_no` INT NOT NULL DEFAULT 1 COMMENT '资格赛尝试轮次' AFTER `score`,
  ADD COLUMN `source_mp_id` INT NULL COMMENT '来源 osu MP id' AFTER `attempt_no`,
  ADD COLUMN `source_game_id` INT NULL COMMENT '来源 osu MP game id' AFTER `source_mp_id`,
  ADD COLUMN `import_id` INT NULL COMMENT '导入批次id' AFTER `source_game_id`,
  ADD COLUMN `is_manual` TINYINT NOT NULL DEFAULT 0 COMMENT '是否手动修正' AFTER `import_id`;

CREATE INDEX `idx_t_qual_score_team_map` ON `t_qual_score` (`team_id`, `map_id`);
CREATE INDEX `idx_t_qual_score_import` ON `t_qual_score` (`import_id`);
CREATE INDEX `idx_t_qual_score_source_mp` ON `t_qual_score` (`source_mp_id`);

CREATE TABLE `t_section` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `t_id` INT NOT NULL COMMENT '赛事id',
  `type` VARCHAR(32) NOT NULL COMMENT 'rules/description/prize/faq',
  `title` VARCHAR(255) NOT NULL COMMENT '内容块标题',
  `title_zh` VARCHAR(255) NULL COMMENT '中文标题',
  `title_en` VARCHAR(255) NULL COMMENT '英文标题',
  `format` VARCHAR(16) NOT NULL DEFAULT 'markdown' COMMENT 'markdown/html',
  `source_markdown` LONGTEXT NULL COMMENT 'Markdown 原文',
  `source_markdown_zh` LONGTEXT NULL COMMENT '中文 Markdown 原文',
  `source_markdown_en` LONGTEXT NULL COMMENT '英文 Markdown 原文',
  `content_html` LONGTEXT NULL COMMENT '渲染后的 HTML',
  `content_html_zh` LONGTEXT NULL COMMENT '中文渲染后的 HTML',
  `content_html_en` LONGTEXT NULL COMMENT '英文渲染后的 HTML',
  `sort_order` INT NOT NULL DEFAULT 0 COMMENT '排序',
  `updated_by` INT NULL COMMENT '最后更新用户id',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_t_section_tid_type` (`t_id`, `type`),
  KEY `idx_t_section_tid_sort` (`t_id`, `sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `t_audit_log` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `t_id` INT NOT NULL COMMENT '赛事id',
  `entity_type` VARCHAR(64) NOT NULL COMMENT '操作对象类型',
  `entity_id` INT NULL COMMENT '操作对象id',
  `action` VARCHAR(64) NOT NULL COMMENT '操作类型',
  `old_value_json` LONGTEXT NULL COMMENT '旧值 JSON',
  `new_value_json` LONGTEXT NULL COMMENT '新值 JSON',
  `operator_id` INT NULL COMMENT '操作者 user_id',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_t_audit_log_tid_time` (`t_id`, `created_time`),
  KEY `idx_t_audit_log_entity` (`entity_type`, `entity_id`),
  KEY `idx_t_audit_log_operator` (`operator_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
