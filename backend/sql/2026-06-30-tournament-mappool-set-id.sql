-- Store osu! beatmapset ids for main-stage mappool covers.
-- Existing rows can be backfilled when an osu! beatmapset URL is available.

ALTER TABLE `t_mappool`
  ADD COLUMN `set_id` INT NULL COMMENT 'osu beatmapset_id' AFTER `map_id`;
