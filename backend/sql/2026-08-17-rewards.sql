CREATE TABLE IF NOT EXISTS point_account (
    user_id INT NOT NULL PRIMARY KEY,
    balance BIGINT NOT NULL DEFAULT 0,
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_point_account_user FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
    CONSTRAINT chk_point_account_balance CHECK (balance >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS reward_item (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    name_zh VARCHAR(120) NULL,
    name_en VARCHAR(120) NULL,
    description TEXT NULL,
    description_zh TEXT NULL,
    description_en TEXT NULL,
    image_url VARCHAR(1024) NULL,
    type ENUM('virtual', 'physical') NOT NULL,
    point_cost INT UNSIGNED NOT NULL,
    stock INT UNSIGNED NOT NULL DEFAULT 0,
    limit_per_user INT UNSIGNED NULL,
    status ENUM('draft', 'active', 'inactive') NOT NULL DEFAULT 'draft',
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    sort_order INT NOT NULL DEFAULT 0,
    id_label VARCHAR(80) NULL,
    id_label_zh VARCHAR(80) NULL,
    id_label_en VARCHAR(80) NULL,
    id_placeholder VARCHAR(160) NULL,
    id_placeholder_zh VARCHAR(160) NULL,
    id_placeholder_en VARCHAR(160) NULL,
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_reward_item_feed (status, sort_order, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS redemption_order (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_no VARCHAR(40) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    total_points BIGINT NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    recipient VARCHAR(80) NULL,
    contact VARCHAR(40) NULL,
    address VARCHAR(500) NULL,
    shipping_remark VARCHAR(500) NULL,
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_redemption_order_user FOREIGN KEY (user_id) REFERENCES user(user_id),
    INDEX idx_redemption_order_user (user_id, id),
    INDEX idx_redemption_order_status (status, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS redemption_order_item (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    order_id BIGINT NOT NULL,
    reward_item_id INT NOT NULL,
    item_name VARCHAR(120) NOT NULL,
    item_name_zh VARCHAR(120) NULL,
    item_name_en VARCHAR(120) NULL,
    item_type ENUM('virtual', 'physical') NOT NULL,
    image_url VARCHAR(1024) NULL,
    unit_points INT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL,
    subtotal_points BIGINT NOT NULL,
    virtual_id VARCHAR(160) NULL,
    remark VARCHAR(500) NULL,
    fulfillment_status ENUM('pending', 'processing', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    fulfillment_detail VARCHAR(500) NULL,
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_redemption_item_order FOREIGN KEY (order_id) REFERENCES redemption_order(id) ON DELETE CASCADE,
    CONSTRAINT fk_redemption_item_reward FOREIGN KEY (reward_item_id) REFERENCES reward_item(id),
    INDEX idx_redemption_item_order (order_id),
    INDEX idx_redemption_item_reward (reward_item_id, fulfillment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS point_transaction (
    id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    type VARCHAR(32) NOT NULL,
    reason VARCHAR(255) NOT NULL,
    order_id BIGINT NULL,
    operator_id INT NULL,
    created_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_point_transaction_user FOREIGN KEY (user_id) REFERENCES user(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_point_transaction_order FOREIGN KEY (order_id) REFERENCES redemption_order(id) ON DELETE SET NULL,
    CONSTRAINT fk_point_transaction_operator FOREIGN KEY (operator_id) REFERENCES user(user_id) ON DELETE SET NULL,
    INDEX idx_point_transaction_user (user_id, id),
    INDEX idx_point_transaction_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
