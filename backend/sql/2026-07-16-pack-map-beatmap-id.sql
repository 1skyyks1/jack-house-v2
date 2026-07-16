-- Store the osu! beatmap id for each selectable pack difficulty.
-- Existing rows receive this value the next time their pack is refreshed from osu!.

ALTER TABLE `pack_map`
  ADD COLUMN `beatmap_id` INT NULL COMMENT 'osu beatmap_id' AFTER `map_id`,
  ADD INDEX `idx_pack_map_beatmap_id` (`beatmap_id`);
