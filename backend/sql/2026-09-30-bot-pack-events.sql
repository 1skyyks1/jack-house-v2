-- 手动在网站 MariaDB 执行。pack 必须使用 InnoDB；迁移期间暂停图包写入。
-- 不回填历史记录。序列行锁持续到业务事务提交，避免 AUTO_INCREMENT 提交乱序漏事件。
CREATE TABLE IF NOT EXISTS bot_pack_event_sequence (
    singleton TINYINT NOT NULL PRIMARY KEY,
    value BIGINT UNSIGNED NOT NULL DEFAULT 0
) ENGINE=InnoDB;
INSERT IGNORE INTO bot_pack_event_sequence(singleton,value) VALUES (1,0);
CREATE TABLE IF NOT EXISTS bot_pack_events (
    id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    pack_id INT NOT NULL,
    old_featured TINYINT NOT NULL,
    featured TINYINT NOT NULL,
    old_recommended TINYINT NOT NULL,
    recommended TINYINT NOT NULL,
    snapshot LONGTEXT NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    INDEX idx_bot_pack_events_pack(pack_id)
) ENGINE=InnoDB;

DELIMITER //
CREATE TRIGGER IF NOT EXISTS bot_pack_events_update AFTER UPDATE ON pack FOR EACH ROW
BEGIN
    IF NOT (OLD.leaderboard_enabled <=> NEW.leaderboard_enabled)
       OR NOT (OLD.is_recommended <=> NEW.is_recommended) THEN
        UPDATE bot_pack_event_sequence SET value=value+1 WHERE singleton=1;
        INSERT INTO bot_pack_events(id,pack_id,old_featured,featured,old_recommended,recommended,snapshot)
        SELECT value,NEW.pack_id,COALESCE(OLD.leaderboard_enabled,0),COALESCE(NEW.leaderboard_enabled,0),
            COALESCE(OLD.is_recommended,0),COALESCE(NEW.is_recommended,0),
            JSON_OBJECT('pack_id',NEW.pack_id,'title',NEW.title,'title_unicode',NEW.title_unicode,
                'artist',NEW.artist,'artist_unicode',NEW.artist_unicode,'creator',NEW.creator,
                'osu_bid',NEW.osu_bid,'type',NEW.type,'tags',JSON_ARRAY())
        FROM bot_pack_event_sequence WHERE singleton=1;
    END IF;
END//
CREATE TRIGGER IF NOT EXISTS bot_pack_events_insert AFTER INSERT ON pack FOR EACH ROW
BEGIN
    IF COALESCE(NEW.leaderboard_enabled,0)=1 OR COALESCE(NEW.is_recommended,0)=1 THEN
        UPDATE bot_pack_event_sequence SET value=value+1 WHERE singleton=1;
        INSERT INTO bot_pack_events(id,pack_id,old_featured,featured,old_recommended,recommended,snapshot)
        SELECT value,NEW.pack_id,0,COALESCE(NEW.leaderboard_enabled,0),0,COALESCE(NEW.is_recommended,0),
            JSON_OBJECT('pack_id',NEW.pack_id,'title',NEW.title,'title_unicode',NEW.title_unicode,
                'artist',NEW.artist,'artist_unicode',NEW.artist_unicode,'creator',NEW.creator,
                'osu_bid',NEW.osu_bid,'type',NEW.type,'tags',JSON_ARRAY())
        FROM bot_pack_event_sequence WHERE singleton=1;
    END IF;
END//
DELIMITER ;
