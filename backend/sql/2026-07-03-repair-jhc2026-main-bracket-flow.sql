-- Repair JHC2026 main-stage bracket source graph to match the official chrono schedule.
-- This preserves existing match ids and only rewires source_match_* fields plus round names.
-- Review unstarted downstream team slots after running if any results were already propagated.

START TRANSACTION;

SET @tournament_id = (
  SELECT id
  FROM tournament
  WHERE acronym = 'JHC2026'
  LIMIT 1
);

UPDATE t_round
SET name = CASE `order`
  WHEN 6 THEN 'Losers RO16'
  WHEN 7 THEN 'Losers Quarterfinals A'
  WHEN 8 THEN 'Losers Quarterfinals B'
  WHEN 9 THEN 'Losers Semifinals A'
  WHEN 10 THEN 'Losers Semifinals B'
  WHEN 11 THEN 'Losers Finals A'
  WHEN 12 THEN 'Losers Finals B'
  WHEN 13 THEN 'Losers Grand Finals'
  ELSE name
END
WHERE t_id = @tournament_id
  AND `order` BETWEEN 6 AND 13;

DROP TEMPORARY TABLE IF EXISTS _jhc_match_ref;
CREATE TEMPORARY TABLE _jhc_match_ref (
  match_no INT PRIMARY KEY,
  match_id INT NOT NULL
);

INSERT INTO _jhc_match_ref (match_no, match_id)
SELECT
  CASE
    WHEN m.bracket_group = 'winner' AND m.round_no = 1 THEN m.slot_no
    WHEN m.bracket_group = 'loser' AND m.round_no = 1 THEN 16 + m.slot_no
    WHEN m.bracket_group = 'winner' AND m.round_no = 2 THEN 24 + m.slot_no
    WHEN m.bracket_group = 'loser' AND m.round_no = 2 THEN 32 + m.slot_no
    WHEN m.bracket_group = 'loser' AND m.round_no = 3 THEN 40 + m.slot_no
    WHEN m.bracket_group = 'winner' AND m.round_no = 3 THEN 44 + m.slot_no
    WHEN m.bracket_group = 'loser' AND m.round_no = 4 THEN 48 + m.slot_no
    WHEN m.bracket_group = 'loser' AND m.round_no = 5 THEN 52 + m.slot_no
    WHEN m.bracket_group = 'winner' AND m.round_no = 4 THEN 54 + m.slot_no
    WHEN m.bracket_group = 'loser' AND m.round_no = 6 THEN 56 + m.slot_no
    WHEN m.bracket_group = 'loser' AND m.round_no = 7 THEN 58 + m.slot_no
    WHEN m.bracket_group = 'winner' AND m.round_no = 5 THEN 59 + m.slot_no
    WHEN m.bracket_group = 'loser' AND m.round_no = 8 THEN 60 + m.slot_no
    WHEN m.bracket_group = 'grand_final' THEN 62
    WHEN m.bracket_group = 'reset_final' THEN 63
    ELSE NULL
  END AS match_no,
  m.id AS match_id
FROM t_match m
JOIN t_round r ON r.id = m.round_id
WHERE r.t_id = @tournament_id
HAVING match_no IS NOT NULL;

DROP TEMPORARY TABLE IF EXISTS _jhc_match_flow;
CREATE TEMPORARY TABLE _jhc_match_flow (
  target_no INT PRIMARY KEY,
  source1_no INT NOT NULL,
  source1_result VARCHAR(16) NOT NULL,
  source2_no INT NOT NULL,
  source2_result VARCHAR(16) NOT NULL
);

INSERT INTO _jhc_match_flow (target_no, source1_no, source1_result, source2_no, source2_result) VALUES
(17, 1, 'loser', 2, 'loser'),
(18, 3, 'loser', 4, 'loser'),
(19, 5, 'loser', 6, 'loser'),
(20, 7, 'loser', 8, 'loser'),
(21, 9, 'loser', 10, 'loser'),
(22, 11, 'loser', 12, 'loser'),
(23, 13, 'loser', 14, 'loser'),
(24, 15, 'loser', 16, 'loser'),
(25, 1, 'winner', 2, 'winner'),
(26, 3, 'winner', 4, 'winner'),
(27, 5, 'winner', 6, 'winner'),
(28, 7, 'winner', 8, 'winner'),
(29, 9, 'winner', 10, 'winner'),
(30, 11, 'winner', 12, 'winner'),
(31, 13, 'winner', 14, 'winner'),
(32, 15, 'winner', 16, 'winner'),
(33, 25, 'loser', 24, 'winner'),
(34, 26, 'loser', 23, 'winner'),
(35, 27, 'loser', 22, 'winner'),
(36, 28, 'loser', 21, 'winner'),
(37, 29, 'loser', 20, 'winner'),
(38, 30, 'loser', 19, 'winner'),
(39, 31, 'loser', 18, 'winner'),
(40, 32, 'loser', 17, 'winner'),
(41, 34, 'winner', 33, 'winner'),
(42, 36, 'winner', 35, 'winner'),
(43, 38, 'winner', 37, 'winner'),
(44, 40, 'winner', 39, 'winner'),
(45, 25, 'winner', 26, 'winner'),
(46, 27, 'winner', 28, 'winner'),
(47, 29, 'winner', 30, 'winner'),
(48, 31, 'winner', 32, 'winner'),
(49, 45, 'loser', 43, 'winner'),
(50, 46, 'loser', 44, 'winner'),
(51, 47, 'loser', 41, 'winner'),
(52, 48, 'loser', 42, 'winner'),
(53, 50, 'winner', 49, 'winner'),
(54, 52, 'winner', 51, 'winner'),
(55, 45, 'winner', 46, 'winner'),
(56, 47, 'winner', 48, 'winner'),
(57, 55, 'loser', 54, 'winner'),
(58, 56, 'loser', 53, 'winner'),
(59, 58, 'winner', 57, 'winner'),
(60, 55, 'winner', 56, 'winner'),
(61, 60, 'loser', 59, 'winner'),
(62, 60, 'winner', 61, 'winner'),
(63, 62, 'winner', 62, 'loser');

UPDATE t_match target
JOIN _jhc_match_ref target_ref ON target_ref.match_id = target.id
JOIN _jhc_match_flow flow ON flow.target_no = target_ref.match_no
JOIN _jhc_match_ref source1 ON source1.match_no = flow.source1_no
JOIN _jhc_match_ref source2 ON source2.match_no = flow.source2_no
SET
  target.source_match_1_id = source1.match_id,
  target.source_match_1_result = flow.source1_result,
  target.source_match_2_id = source2.match_id,
  target.source_match_2_result = flow.source2_result,
  target.hidden_until_match_id = CASE WHEN flow.target_no = 63 THEN source1.match_id ELSE target.hidden_until_match_id END,
  target.is_possible = CASE WHEN flow.target_no = 63 THEN 1 ELSE target.is_possible END;

UPDATE t_match target
JOIN _jhc_match_ref target_ref ON target_ref.match_id = target.id
SET
  target.source_match_1_id = NULL,
  target.source_match_1_result = NULL,
  target.source_match_2_id = NULL,
  target.source_match_2_result = NULL
WHERE target_ref.match_no BETWEEN 1 AND 16;

COMMIT;
