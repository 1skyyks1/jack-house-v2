-- Run the duplicate check first. Resolve any returned rows before adding the unique key.
SELECT
  `map_id`,
  `team_id`,
  `player_id`,
  `source_mp_id`,
  `source_game_id`,
  COUNT(*) AS `duplicate_count`
FROM `t_qual_score`
WHERE `source_mp_id` IS NOT NULL AND `source_game_id` IS NOT NULL
GROUP BY `map_id`, `team_id`, `player_id`, `source_mp_id`, `source_game_id`
HAVING COUNT(*) > 1;

ALTER TABLE `t_qual_score`
  ADD UNIQUE KEY `uk_t_qual_score_source_game`
    (`map_id`, `team_id`, `player_id`, `source_mp_id`, `source_game_id`);
