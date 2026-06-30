-- Reset tournament related schema for development.
-- WARNING: This drops all tournament data in the listed tables.
-- Run in Navicat against a MariaDB/MySQL database.

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `t_audit_log`;
DROP TABLE IF EXISTS `t_section`;
DROP TABLE IF EXISTS `t_qual_score`;
DROP TABLE IF EXISTS `t_qual_import`;
DROP TABLE IF EXISTS `t_qual_mappool`;
DROP TABLE IF EXISTS `t_game`;
DROP TABLE IF EXISTS `t_match_action`;
DROP TABLE IF EXISTS `t_match`;
DROP TABLE IF EXISTS `t_mappool`;
DROP TABLE IF EXISTS `t_round`;
DROP TABLE IF EXISTS `t_player`;
DROP TABLE IF EXISTS `t_team`;
DROP TABLE IF EXISTS `t_staff`;
DROP TABLE IF EXISTS `tournament`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `tournament` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(255) NOT NULL COMMENT '赛事正式名称',
  `acronym` VARCHAR(32) NOT NULL COMMENT '赛事名称缩写',
  `desc_zh` VARCHAR(255) NULL COMMENT '赛事简介（中文）',
  `desc_en` VARCHAR(255) NULL COMMENT '赛事简介（英文）',
  `rule_zh` TEXT NULL COMMENT '赛事规则（中文）',
  `rule_en` TEXT NULL COMMENT '赛事规则（英文）',
  `banner` VARCHAR(255) NULL COMMENT '横幅图片',
  `team_size_min` INT NOT NULL DEFAULT 1 COMMENT '队伍最少人数',
  `team_size_max` INT NOT NULL DEFAULT 2 COMMENT '队伍最大人数',
  `qual_top_n` TINYINT DEFAULT 32 COMMENT '资格赛前n晋级正赛',
  `qual_rank_mode` TINYINT DEFAULT 0 COMMENT '0=排名累加 1=加权分数',
  `reg_start` DATETIME NOT NULL COMMENT '报名开始时间',
  `reg_end` DATETIME NOT NULL COMMENT '报名结束时间',
  `qual_start` DATETIME NULL COMMENT '资格赛开始时间',
  `qual_end` DATETIME NULL COMMENT '资格赛结束时间',
  `qual_locked_at` DATETIME NULL COMMENT '资格赛排名锁定时间',
  `qual_locked_by` INT NULL COMMENT '锁定资格赛排名的 user_id',
  `qual_locked_top_n` INT NULL COMMENT '锁定时的晋级名额',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=未开始 1=报名中 2=资格赛 3=正赛 4=已结束',
  `created_by` INT NULL COMMENT '创建者 user_id；creator host 可删除赛事和添加其他 host',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tournament_created_by` (`created_by`),
  KEY `idx_tournament_qual_locked` (`qual_locked_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `t_staff` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `t_id` INT NOT NULL COMMENT '赛事id',
  `user_id` INT NOT NULL COMMENT '用户id',
  `role` VARCHAR(32) NOT NULL COMMENT 'host/referee/pooler/streamer/commentator',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_t_staff_tid_user_role` (`t_id`, `user_id`, `role`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `t_team` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `t_id` INT NOT NULL COMMENT '赛事id',
  `name` VARCHAR(255) NOT NULL COMMENT '原始队名',
  `display_name` VARCHAR(255) NOT NULL COMMENT '赛时使用名',
  `invite_code` VARCHAR(8) NULL COMMENT '邀请码',
  `avatar` VARCHAR(1024) NULL COMMENT '队伍头像，第一版可预留',
  `is_open` TINYINT NOT NULL DEFAULT 0 COMMENT '是否开放组队',
  `captain_id` INT NOT NULL COMMENT '队长user_id，兼容旧逻辑',
  `captain_player_id` INT NULL COMMENT '队长player_id，长期队长关系以此字段为准',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '兼容旧逻辑：0=created/pending 1=approved 2=reserved 3=locked',
  `qual_mp_id` INT NULL COMMENT '资格赛MP房间id',
  `qual_rank` INT NULL COMMENT '资格赛排名',
  `qual_score` INT NULL COMMENT '资格赛总分',
  `locked_at` DATETIME NULL COMMENT '队伍锁定时间',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_t_team_invite_code` (`invite_code`),
  KEY `idx_t_team_captain_player` (`captain_player_id`),
  KEY `idx_t_team_open` (`t_id`, `is_open`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `t_player` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `team_id` INT NULL COMMENT '队伍id',
  `t_id` INT NOT NULL COMMENT '赛事id，冗余自 team.t_id，用于同赛事唯一校验和查询',
  `user_id` INT NOT NULL COMMENT '用户id',
  `user_name_snapshot` VARCHAR(255) NULL COMMENT '报名时用户名快照',
  `avatar_snapshot` VARCHAR(1024) NULL COMMENT '报名时头像快照',
  `contact_qq` VARCHAR(64) NULL COMMENT '赛事联系方式 QQ',
  `contact_discord` VARCHAR(128) NULL COMMENT '赛事联系方式 Discord',
  `timezone` VARCHAR(64) NULL COMMENT '选手时区',
  `remark` TEXT NULL COMMENT '报名备注',
  `review_status` VARCHAR(32) NOT NULL DEFAULT 'review_pending' COMMENT 'review_pending/review_passed/review_failed',
  `is_captain` TINYINT NOT NULL DEFAULT 0 COMMENT '是否队长',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_t_player_tid_user` (`t_id`, `user_id`),
  KEY `idx_t_player_team_user` (`team_id`, `user_id`),
  KEY `idx_t_player_review_status` (`review_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `t_round` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `t_id` INT NOT NULL COMMENT '赛事id',
  `name` VARCHAR(64) NOT NULL COMMENT '轮次名 RO32/RO16/QF/SF/F/GF',
  `bracket_type` TINYINT NOT NULL COMMENT '0=胜者组 1=败者组',
  `first_to` INT NOT NULL COMMENT '先到几分获胜',
  `order` INT NULL COMMENT '轮次顺序',
  `start_time` DATETIME NULL,
  `end_time` DATETIME NULL,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `t_mappool` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `round_id` INT NOT NULL COMMENT '轮次id',
  `type` VARCHAR(16) NOT NULL COMMENT 'FU/DS/MD/LT/AC/QS/MN/RM/MX/DF/TB',
  `map_id` INT NOT NULL COMMENT 'osu beatmap_id',
  `set_id` INT NULL COMMENT 'osu beatmapset_id',
  `artist` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `mapper` VARCHAR(255) NOT NULL,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_t_mappool_round_map` (`round_id`, `map_id`),
  KEY `idx_t_mappool_round_type` (`round_id`, `type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `t_match` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `round_id` INT NOT NULL COMMENT '轮次id',
  `mp_id` INT NULL COMMENT 'osu MP房间id',
  `team1_id` INT NULL COMMENT '红队',
  `team2_id` INT NULL COMMENT '蓝队',
  `team1_roll` INT NULL COMMENT '红队roll点',
  `team2_roll` INT NULL COMMENT '蓝队roll点',
  `team1_score` INT NOT NULL DEFAULT 0 COMMENT '红队胜场',
  `team2_score` INT NOT NULL DEFAULT 0 COMMENT '蓝队胜场',
  `winner_id` INT NULL COMMENT '胜者队伍id',
  `result_type` VARCHAR(16) NOT NULL DEFAULT 'normal' COMMENT 'normal/wbd/ff',
  `result_note` TEXT NULL COMMENT 'WBD/FF 或手动改判备注',
  `winner_overridden` TINYINT NOT NULL DEFAULT 0 COMMENT '胜方是否由 referee 手动修改',
  `is_possible` TINYINT NOT NULL DEFAULT 0 COMMENT 'GF(P)标记',
  `bracket_group` VARCHAR(32) NULL COMMENT 'winner/loser/grand_final/reset_final',
  `round_no` INT NULL COMMENT '同 bracket group 内轮次序号',
  `slot_no` INT NULL COMMENT '同轮次内位置',
  `source_match_1_id` INT NULL COMMENT '队伍1来源比赛',
  `source_match_1_result` VARCHAR(16) NULL COMMENT 'winner/loser',
  `source_match_2_id` INT NULL COMMENT '队伍2来源比赛',
  `source_match_2_result` VARCHAR(16) NULL COMMENT 'winner/loser',
  `hidden_until_match_id` INT NULL COMMENT '隐藏到指定比赛完成后再展示',
  `scheduled_time` DATETIME NOT NULL COMMENT '预定时间',
  `status` TINYINT NOT NULL DEFAULT 0 COMMENT '0=未开始 1=兼容旧进行中 2=已完成',
  `team1_timeout_used` TINYINT NOT NULL DEFAULT 0,
  `team2_timeout_used` TINYINT NOT NULL DEFAULT 0,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_t_match_result_type` (`result_type`),
  KEY `idx_t_match_bracket_slot` (`bracket_group`, `round_no`, `slot_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `t_game` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `match_id` INT NOT NULL,
  `map_id` INT NOT NULL COMMENT '打的哪张图',
  `order` INT NOT NULL COMMENT '第几局',
  `player1_id` INT NOT NULL COMMENT 'team1上场选手',
  `player2_id` INT NOT NULL COMMENT 'team2上场选手',
  `player1_score` INT NOT NULL COMMENT 'team1选手分数',
  `player2_score` INT NOT NULL COMMENT 'team2选手分数',
  `winner_team` TINYINT NOT NULL COMMENT '1=红队胜 2=蓝队胜',
  `action_type` TINYINT NOT NULL COMMENT '0=protect 1=ban 2=pick',
  `action_by` TINYINT NOT NULL COMMENT '1=红队 2=蓝队',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `t_qual_mappool` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `t_id` INT NOT NULL COMMENT '赛事id',
  `index` INT NOT NULL COMMENT 'stage编号 1-7',
  `map_id` INT NOT NULL COMMENT 'osu beatmap_id',
  `artist` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `mapper` VARCHAR(255) NOT NULL,
  `weight` FLOAT DEFAULT 1 COMMENT '权重',
  `set_id` INT NULL COMMENT 'osu beatmapset_id',
  `version` VARCHAR(255) NULL COMMENT '难度名',
  `star` DECIMAL(10, 2) NULL COMMENT '星级',
  `hp` DECIMAL(10, 1) NULL COMMENT 'HP',
  `od` DECIMAL(10, 1) NULL COMMENT 'OD',
  `length` INT NULL COMMENT '长度（秒）',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_t_qual_mappool_tid_stage` (`t_id`, `index`),
  UNIQUE KEY `uk_t_qual_mappool_tid_map` (`t_id`, `map_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE `t_qual_score` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `map_id` INT NOT NULL COMMENT '资格赛图id',
  `team_id` INT NOT NULL COMMENT '队伍id',
  `player_id` INT NOT NULL COMMENT '选手id',
  `score` INT NOT NULL COMMENT '分数',
  `attempt_no` INT NOT NULL DEFAULT 1 COMMENT '资格赛尝试轮次',
  `source_mp_id` INT NULL COMMENT '来源 osu MP id',
  `source_game_id` INT NULL COMMENT '来源 osu MP game id',
  `import_id` INT NULL COMMENT '导入批次id',
  `is_manual` TINYINT NOT NULL DEFAULT 0 COMMENT '是否手动修正',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_t_qual_score_team_map` (`team_id`, `map_id`),
  KEY `idx_t_qual_score_import` (`import_id`),
  KEY `idx_t_qual_score_source_mp` (`source_mp_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
