ALTER TABLE reward_item
    ADD COLUMN IF NOT EXISTS name_zh VARCHAR(120) NULL AFTER name,
    ADD COLUMN IF NOT EXISTS name_en VARCHAR(120) NULL AFTER name_zh,
    ADD COLUMN IF NOT EXISTS description_zh TEXT NULL AFTER description,
    ADD COLUMN IF NOT EXISTS description_en TEXT NULL AFTER description_zh,
    ADD COLUMN IF NOT EXISTS id_label_zh VARCHAR(80) NULL AFTER id_label,
    ADD COLUMN IF NOT EXISTS id_label_en VARCHAR(80) NULL AFTER id_label_zh,
    ADD COLUMN IF NOT EXISTS id_placeholder_zh VARCHAR(160) NULL AFTER id_placeholder,
    ADD COLUMN IF NOT EXISTS id_placeholder_en VARCHAR(160) NULL AFTER id_placeholder_zh;

UPDATE reward_item
SET name_zh = COALESCE(NULLIF(name_zh, ''), name),
    name_en = COALESCE(NULLIF(name_en, ''), name),
    description_zh = COALESCE(description_zh, description),
    description_en = COALESCE(description_en, description),
    id_label_zh = COALESCE(id_label_zh, id_label),
    id_label_en = COALESCE(id_label_en, id_label),
    id_placeholder_zh = COALESCE(id_placeholder_zh, id_placeholder),
    id_placeholder_en = COALESCE(id_placeholder_en, id_placeholder);

ALTER TABLE redemption_order_item
    ADD COLUMN IF NOT EXISTS item_name_zh VARCHAR(120) NULL AFTER item_name,
    ADD COLUMN IF NOT EXISTS item_name_en VARCHAR(120) NULL AFTER item_name_zh;

UPDATE redemption_order_item
SET item_name_zh = COALESCE(NULLIF(item_name_zh, ''), item_name),
    item_name_en = COALESCE(NULLIF(item_name_en, ''), item_name);
