CREATE TABLE IF NOT EXISTS `ai_image_runtime` (
  `runtime_id` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`runtime_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO `ai_image_runtime` (`runtime_id`) VALUES (1);

CREATE TABLE IF NOT EXISTS `ai_image_job` (
  `ai_image_job_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `public_id` CHAR(36) NOT NULL,
  `user_id` INT NOT NULL,
  `upstream_job_id` VARCHAR(64) NULL,
  `idempotency_key` VARCHAR(64) NOT NULL,
  `request_type` VARCHAR(16) NOT NULL DEFAULT 'generation',
  `prompt` LONGTEXT NOT NULL,
  `model` VARCHAR(64) NOT NULL DEFAULT 'gpt-image-2',
  `size` VARCHAR(32) NOT NULL DEFAULT '1024x1024',
  `reference_count` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `reference_metadata` JSON NULL,
  `has_mask` TINYINT(1) NOT NULL DEFAULT 0,
  `mask_metadata` JSON NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'submitting',
  `quota_date` DATE NOT NULL,
  `quota_units` TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `quota_refunded` TINYINT(1) NOT NULL DEFAULT 0,
  `cost_usd` DECIMAL(12,6) NULL,
  `error_code` VARCHAR(96) NULL,
  `error_message` TEXT NULL,
  `source_ip` VARCHAR(45) NULL,
  `user_agent` VARCHAR(512) NULL,
  `upstream_created_at` DATETIME NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `expires_at` DATETIME NULL,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`ai_image_job_id`),
  UNIQUE KEY `uq_ai_image_job_public_id` (`public_id`),
  UNIQUE KEY `uq_ai_image_job_upstream_id` (`upstream_job_id`),
  UNIQUE KEY `uq_ai_image_job_user_idempotency` (`user_id`, `idempotency_key`),
  KEY `idx_ai_image_job_user_created` (`user_id`, `created_time`),
  KEY `idx_ai_image_job_status_created` (`status`, `created_time`),
  KEY `idx_ai_image_job_quota_user` (`quota_date`, `user_id`),
  CONSTRAINT `fk_ai_image_job_user`
    FOREIGN KEY (`user_id`) REFERENCES `user` (`user_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
