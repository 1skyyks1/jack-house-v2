ALTER TABLE `t_section`
  ADD COLUMN `title_zh` VARCHAR(255) NULL COMMENT '中文标题' AFTER `title`,
  ADD COLUMN `title_en` VARCHAR(255) NULL COMMENT '英文标题' AFTER `title_zh`,
  ADD COLUMN `source_markdown_zh` LONGTEXT NULL COMMENT '中文 Markdown 原文' AFTER `source_markdown`,
  ADD COLUMN `source_markdown_en` LONGTEXT NULL COMMENT '英文 Markdown 原文' AFTER `source_markdown_zh`,
  ADD COLUMN `content_html_zh` LONGTEXT NULL COMMENT '中文渲染后的 HTML' AFTER `content_html`,
  ADD COLUMN `content_html_en` LONGTEXT NULL COMMENT '英文渲染后的 HTML' AFTER `content_html_zh`;

UPDATE `t_section`
SET
  `title_zh` = COALESCE(NULLIF(`title_zh`, ''), `title`),
  `source_markdown_zh` = COALESCE(`source_markdown_zh`, `source_markdown`),
  `content_html_zh` = COALESCE(`content_html_zh`, `content_html`);
