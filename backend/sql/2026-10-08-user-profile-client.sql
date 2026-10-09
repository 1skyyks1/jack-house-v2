ALTER TABLE `user`
    ADD COLUMN IF NOT EXISTS `default_pp_client` VARCHAR(8) NOT NULL DEFAULT 'stable';
