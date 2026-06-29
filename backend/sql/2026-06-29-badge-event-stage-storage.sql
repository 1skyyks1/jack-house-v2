ALTER TABLE `badge`
    ADD COLUMN IF NOT EXISTS `storage_provider` VARCHAR(32) NULL COMMENT 'storage provider' AFTER `minio_img_name`,
    ADD COLUMN IF NOT EXISTS `object_key` VARCHAR(255) NULL COMMENT 'storage object key' AFTER `storage_provider`,
    ADD COLUMN IF NOT EXISTS `public_url` VARCHAR(512) NULL COMMENT 'public url' AFTER `object_key`,
    ADD COLUMN IF NOT EXISTS `download_url` VARCHAR(512) NULL COMMENT 'download url' AFTER `public_url`,
    ADD COLUMN IF NOT EXISTS `mime_type` VARCHAR(128) NULL COMMENT 'mime type' AFTER `download_url`,
    ADD COLUMN IF NOT EXISTS `checksum` VARCHAR(64) NULL COMMENT 'sha256 checksum' AFTER `mime_type`;

UPDATE `badge`
SET
    `storage_provider` = COALESCE(`storage_provider`, 'minio'),
    `object_key` = COALESCE(`object_key`, `minio_img_name`)
WHERE `storage_provider` IS NULL OR `object_key` IS NULL;

ALTER TABLE `event_stage`
    ADD COLUMN IF NOT EXISTS `storage_provider` VARCHAR(32) NULL COMMENT 'storage provider' AFTER `minio_bg`,
    ADD COLUMN IF NOT EXISTS `object_key` VARCHAR(255) NULL COMMENT 'storage object key' AFTER `storage_provider`,
    ADD COLUMN IF NOT EXISTS `public_url` VARCHAR(512) NULL COMMENT 'public url' AFTER `object_key`,
    ADD COLUMN IF NOT EXISTS `download_url` VARCHAR(512) NULL COMMENT 'download url' AFTER `public_url`,
    ADD COLUMN IF NOT EXISTS `mime_type` VARCHAR(128) NULL COMMENT 'mime type' AFTER `download_url`,
    ADD COLUMN IF NOT EXISTS `checksum` VARCHAR(64) NULL COMMENT 'sha256 checksum' AFTER `mime_type`;

UPDATE `event_stage`
SET
    `storage_provider` = COALESCE(`storage_provider`, 'minio'),
    `object_key` = COALESCE(`object_key`, `minio_bg`)
WHERE `storage_provider` IS NULL OR `object_key` IS NULL;
