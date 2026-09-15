-- 为系统角色表增加中英文显示名字段并回填初始数据
ALTER TABLE `role`
ADD COLUMN `name_zh` VARCHAR(100) NULL AFTER `role_name`,
ADD COLUMN `name_en` VARCHAR(100) NULL AFTER `name_zh`;

UPDATE `role` SET `name_zh` = '超级管理员', `name_en` = 'Administrator' WHERE `role_code` = 'admin';
UPDATE `role` SET `name_zh` = '活动组织者', `name_en` = 'Organizer' WHERE `role_code` = 'organizer';
UPDATE `role` SET `name_zh` = '投稿审核员', `name_en` = 'Reviewer' WHERE `role_code` = 'moderator';
UPDATE `role` SET `name_zh` = '叠包主理人', `name_en` = 'Pack Curator' WHERE `role_code` = 'pack_reviewer';

UPDATE `role` SET `name_zh` = `role_name` WHERE `name_zh` IS NULL;
UPDATE `role` SET `name_en` = `role_name` WHERE `name_en` IS NULL;
