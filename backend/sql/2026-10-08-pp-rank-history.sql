CREATE TABLE IF NOT EXISTS pp_rank_history (
    user_id INT NOT NULL,
    client VARCHAR(8) NOT NULL,
    algorithm_version VARCHAR(64) NOT NULL,
    snapshot_date DATE NOT NULL,
    rank_position INT UNSIGNED NULL,
    total_pp DOUBLE NOT NULL,
    recorded_at DATETIME NOT NULL,
    PRIMARY KEY (user_id, client, algorithm_version, snapshot_date),
    CONSTRAINT fk_pp_history_user FOREIGN KEY (user_id) REFERENCES `user` (user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
