-- Persist storage metadata for uploaded post files and home images.

ALTER TABLE `post_file`
  ADD COLUMN `storage_provider` VARCHAR(32) NULL COMMENT '存储 provider' AFTER `file_url`,
  ADD COLUMN `object_key` VARCHAR(255) NULL COMMENT '存储对象 key' AFTER `storage_provider`,
  ADD COLUMN `public_url` VARCHAR(1024) NULL COMMENT '公开访问 URL' AFTER `object_key`,
  ADD COLUMN `download_url` VARCHAR(1024) NULL COMMENT '下载 URL' AFTER `public_url`,
  ADD COLUMN `mime_type` VARCHAR(255) NULL COMMENT 'MIME 类型' AFTER `download_url`,
  ADD COLUMN `checksum` VARCHAR(64) NULL COMMENT 'SHA-256 文件校验值' AFTER `size`;

CREATE INDEX `idx_post_file_checksum` ON `post_file` (`checksum`);

UPDATE `post_file`
SET
  `storage_provider` = COALESCE(`storage_provider`, 'minio'),
  `object_key` = COALESCE(`object_key`, `file_url`)
WHERE `storage_provider` IS NULL OR `object_key` IS NULL;

ALTER TABLE `home_img`
  ADD COLUMN `storage_provider` VARCHAR(32) NULL COMMENT '存储 provider' AFTER `minio_img_name`,
  ADD COLUMN `object_key` VARCHAR(255) NULL COMMENT '存储对象 key' AFTER `storage_provider`,
  ADD COLUMN `public_url` VARCHAR(1024) NULL COMMENT '公开访问 URL' AFTER `object_key`,
  ADD COLUMN `download_url` VARCHAR(1024) NULL COMMENT '下载 URL' AFTER `public_url`,
  ADD COLUMN `mime_type` VARCHAR(255) NULL COMMENT 'MIME 类型' AFTER `download_url`;

UPDATE `home_img`
SET
  `storage_provider` = COALESCE(`storage_provider`, 'minio'),
  `object_key` = COALESCE(`object_key`, `minio_img_name`)
WHERE `storage_provider` IS NULL OR `object_key` IS NULL;
