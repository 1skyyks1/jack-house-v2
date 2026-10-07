-- 先关闭机器人事件读取，再回滚。事件表保留用于审计/恢复；不要重置序列。
DROP TRIGGER IF EXISTS bot_pack_events_update;
DROP TRIGGER IF EXISTS bot_pack_events_insert;
-- 如确定不再恢复此功能，备份后才可 DROP TABLE bot_pack_events, bot_pack_event_sequence。
