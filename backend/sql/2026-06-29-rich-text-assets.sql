CREATE TABLE IF NOT EXISTS `rich_text_asset` (
  `rich_text_asset_id` INT NOT NULL AUTO_INCREMENT,
  `user_id` INT NULL,
  `storage_provider` VARCHAR(32) NOT NULL,
  `object_key` VARCHAR(255) NOT NULL,
  `public_url` VARCHAR(1024) NULL,
  `download_url` VARCHAR(1024) NULL,
  `mime_type` VARCHAR(128) NULL,
  `size` INT NULL,
  `checksum` VARCHAR(64) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'uploaded',
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `orphaned_time` DATETIME NULL,
  PRIMARY KEY (`rich_text_asset_id`),
  UNIQUE KEY `uk_rich_text_asset_object_key` (`object_key`),
  KEY `idx_rich_text_asset_status` (`status`),
  KEY `idx_rich_text_asset_user_id` (`user_id`),
  KEY `idx_rich_text_asset_checksum` (`checksum`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

CREATE TABLE IF NOT EXISTS `rich_text_asset_reference` (
  `rich_text_asset_reference_id` INT NOT NULL AUTO_INCREMENT,
  `rich_text_asset_id` INT NOT NULL,
  `content_type` VARCHAR(64) NOT NULL,
  `content_id` INT NOT NULL,
  `source_url` VARCHAR(1024) NULL,
  `created_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`rich_text_asset_reference_id`),
  UNIQUE KEY `uk_rich_text_asset_reference_content` (`rich_text_asset_id`, `content_type`, `content_id`),
  KEY `idx_rich_text_asset_reference_content` (`content_type`, `content_id`),
  CONSTRAINT `fk_rich_text_asset_reference_asset`
    FOREIGN KEY (`rich_text_asset_id`) REFERENCES `rich_text_asset` (`rich_text_asset_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
