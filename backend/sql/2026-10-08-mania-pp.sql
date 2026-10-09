CREATE TABLE IF NOT EXISTS pp_rules (
    id TINYINT NOT NULL PRIMARY KEY,
    algorithm_version VARCHAR(64) NOT NULL,
    top_count INT NOT NULL DEFAULT 50,
    decay DOUBLE NOT NULL DEFAULT 0.95
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO pp_rules (id, algorithm_version, top_count, decay)
VALUES (1, 'mania-4k-rosu-4.0.1-v1', 50, 0.95);

CREATE TABLE IF NOT EXISTS pp_beatmap_source (
    checksum CHAR(32) NOT NULL PRIMARY KEY,
    beatmap_id INT NOT NULL,
    content MEDIUMTEXT NOT NULL,
    object_count INT UNSIGNED NOT NULL,
    hold_count INT UNSIGNED NOT NULL,
    fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pp_source_map (beatmap_id, fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pp_score_attempt (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    attempt_key CHAR(64) NOT NULL,
    user_id INT NOT NULL,
    beatmap_id INT NOT NULL,
    client VARCHAR(8) NOT NULL,
    osu_score_id VARCHAR(32) NULL,
    build_id BIGINT UNSIGNED NULL,
    score INT UNSIGNED NULL,
    accuracy DOUBLE NULL,
    max_combo INT UNSIGNED NULL,
    score_rank VARCHAR(2) NULL,
    statistics JSON NULL,
    mods JSON NULL,
    passed TINYINT(1) NOT NULL,
    played_at DATETIME NULL,
    reported_checksum CHAR(32) NULL,
    source_checksum CHAR(32) NULL,
    source_verified TINYINT(1) NOT NULL DEFAULT 0,
    captured_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pp_attempt (attempt_key),
    KEY idx_pp_attempt_bp (user_id, client, beatmap_id),
    KEY idx_pp_attempt_map (beatmap_id),
    CONSTRAINT fk_pp_attempt_user FOREIGN KEY (user_id) REFERENCES `user` (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pp_score_result (
    attempt_id BIGINT UNSIGNED NOT NULL,
    algorithm_version VARCHAR(64) NOT NULL,
    status VARCHAR(12) NOT NULL DEFAULT 'pending',
    pp DOUBLE NULL,
    stars DOUBLE NULL,
    clock_rate DOUBLE NULL,
    source_checksum CHAR(32) NULL,
    reason VARCHAR(80) NULL,
    tries INT NOT NULL DEFAULT 0,
    retry_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lease_token CHAR(36) NULL,
    lease_until DATETIME NULL,
    calculated_at DATETIME NULL,
    PRIMARY KEY (attempt_id, algorithm_version),
    KEY idx_pp_result_queue (algorithm_version, status, retry_at),
    CONSTRAINT fk_pp_result_attempt FOREIGN KEY (attempt_id) REFERENCES pp_score_attempt (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pp_difficulty (
    cache_key CHAR(64) NOT NULL PRIMARY KEY,
    source_checksum CHAR(32) NOT NULL,
    algorithm_version VARCHAR(64) NOT NULL,
    client VARCHAR(8) NOT NULL,
    mods JSON NOT NULL,
    clock_rate DOUBLE NOT NULL,
    stars DOUBLE NOT NULL,
    attributes JSON NOT NULL,
    calculated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pp_difficulty_version (algorithm_version, source_checksum)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE OR REPLACE VIEW pp_best_score AS
SELECT ranked.* FROM (
    SELECT a.*, r.pp, r.stars, r.clock_rate, r.algorithm_version, r.calculated_at,
           ROW_NUMBER() OVER (
               PARTITION BY a.user_id, a.beatmap_id, a.client
               ORDER BY r.pp DESC, a.played_at ASC, a.id ASC
           ) AS best_position
    FROM pp_score_attempt a
    JOIN pp_score_result r ON r.attempt_id = a.id AND r.status = 'ready'
    JOIN pp_rules rules ON rules.id = 1 AND rules.algorithm_version = r.algorithm_version
    WHERE EXISTS (
        SELECT 1 FROM pack_map pm JOIN pack p ON p.pack_id = pm.pack_id
        WHERE pm.beatmap_id = a.beatmap_id AND p.leaderboard_enabled = 1
    )
) ranked WHERE ranked.best_position = 1;
