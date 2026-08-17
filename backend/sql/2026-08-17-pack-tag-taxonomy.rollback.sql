-- Roll back taxonomy columns without touching tag IDs or pack_tags relations.
-- tag_name remains the compatibility label for every tag created or edited after migration.

DROP INDEX IF EXISTS `idx_tag_category_enabled_sort` ON `tag`;
DROP INDEX IF EXISTS `uq_tag_key` ON `tag`;

ALTER TABLE `tag`
  DROP COLUMN IF EXISTS `enabled`,
  DROP COLUMN IF EXISTS `sort_order`,
  DROP COLUMN IF EXISTS `name_en`,
  DROP COLUMN IF EXISTS `name_zh`,
  DROP COLUMN IF EXISTS `category`,
  DROP COLUMN IF EXISTS `tag_key`;
