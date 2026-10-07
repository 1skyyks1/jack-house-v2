# 帖子悬赏接口

后端位于 `D:/GitHub/jackhouse/backend`，React 前端位于 `D:/GitHub/jack-house-v3`。
以下路径相对于现有 API 根路径，沿用现有登录 Cookie、CSRF 和响应 envelope。

## 发布与编辑

新增帖子类型 `4 = 悬赏`，原有 0/1/2/3 的含义和权限保留。所有已登录用户都可发布悬赏，关联的 Pack 无需属于发布者。

`POST /post` 示例：

```json
{
  "type": 4,
  "pack_ids": [42],
  "end": null,
  "limit": null,
  "translations": [
    { "language": "zh", "title": "指定难度 FC 挑战", "content": "<p>在此填写奖励、目标和参与规则。</p>" },
    { "language": "en", "title": "", "content": "" }
  ]
}
```

成功返回 HTTP 201：`{ "data": { "post_id": 123 } }`。

- `pack_ids`：1–5 个不同的正整数站内 Pack ID，所有 Pack 必须存在；不是 osu! beatmapset ID。
- `end`：空值或省略表示永久；限时使用带时区的 ISO 8601 字符串，例如 `2026-10-31T15:59:00.000Z`。创建或改设的日期必须在未来。
- 新建悬赏的前端默认要求选择具体截止时间；用户主动勾选「永久」时才提交 `end: null`。
- `translations`：1–2 个语言版本（zh/en），至少一种语言有非空标题与经过 HTML 清理后仍有文字的正文。标题最多 255 字符。正文沿用现有富文本清理和图片引用机制。
- 悬赏不使用征稿数量限制，`limit` 保存为空。
- `bounty_closed_at` 是服务端字段，创建/编辑请求不能修改它。

`PUT /post/:post_id` 沿用现有接口，允许作者或拥有 `posts` 权限的管理员编辑。

- 对现有悬赏省略 `end` / `pack_ids` 时保留原值；`end: null` 明确改为永久。
- 提供 `pack_ids` 时整体替换关联，不能传空数组。
- 提供 `translations` 时按上述完整语言对象格式提交。
- 已经到期的原截止时间可以原样提交以编辑正文；不能改设新的过去时间。
- 到期悬赏改设未来时间或永久后会重新有效；手动结束的悬赏则始终保持关闭，编辑不能重新开启。
- 普通帖子可改成悬赏，此时必须同时提供有效的关联与规则正文。悬赏类型一旦建立，不能再改成其他类型。
- 帖子、关联和富文本图片引用在同一事务提交；写入失败整体回滚。

输入错误 HTTP 400；无权修改 HTTP 403；帖子不存在 HTTP 404。

## 手动结束

`PATCH /post/:post_id/bounty/close`，不需要请求正文，需要登录。

只允许帖主或拥有 `posts` 权限的管理员操作。接口幂等，重复调用不会改变首次关闭时间。

```json
{
  "data": {
    "post_id": 123,
    "bounty_closed_at": "2026-10-05T10:00:00.000Z",
    "bounty_status": "closed"
  },
  "message": "悬赏已结束"
}
```

关闭时对帖子加行锁，与编辑操作串行，避免同时编辑意外覆盖关闭状态。

## 帖子读取

`GET /post/:post_id` 增加：

- `bounty_closed_at: string | null`。
- `bounty_status: "active" | "expired" | "closed" | null`：非悬赏为 null；手动结束优先于到期状态。
- `pack_ids: number[]`。
- `linked_packs`：关联 Pack 简要对象数组，包含 pack_id/title/title_unicode/artist/artist_unicode/creator/osu_bid/cover_id/type，用于帖子展示和编辑回填。

帖子列表也返回 `bounty_status` 与 `bounty_closed_at`。`GET /post/type/4` 可获取悬赏列表，`GET /post/forum` 增加 type=4 分组。结束的帖子继续保留在论坛。

## Pack 列表与详情

`GET /pack?bounty=1&page=1&pageSize=20`：仅筛选存在有效悬赏的 Pack。`bounty=true` 同样支持；省略、0、false 不筛选。可与现有搜索、标签、类型、推荐等筛选组合，沿用现有分页与排序。

有效悬赏定义：type=4、没有手动结束，且结束时间为空或晚于本次查询的服务端时间。到期自动失效，无需定时任务或手动维护 Pack 标记。

Pack 列表新增 `has_bounty: boolean` 和 `bounty_count: number`（有效悬赏数量）。

`GET /pack/:pack_id` 同样新增这两个字段，并返回 `bounties` 有效悬赏摘要数组：

```json
{
  "data": {
    "pack_id": 42,
    "has_bounty": true,
    "bounty_count": 1,
    "bounties": [
      {
        "post_id": 123,
        "user_id": 7,
        "type": 4,
        "end": null,
        "bounty_closed_at": null,
        "bounty_status": "active",
        "created_time": "2026-10-05T08:00:00.000Z",
        "updated_time": "2026-10-05T08:00:00.000Z",
        "translations": [{ "language": "zh", "title": "指定难度 FC 挑战" }],
        "user": { "user_id": 7, "user_name": "Jack", "avatar": null }
      }
    ]
  }
}
```

上例省略了现有 Pack 字段。摘要按 created_time DESC、post_id DESC 排序，只含标题，不重复返回规则正文。无有效悬赏时返回 `has_bounty: false, bounty_count: 0, bounties: []`。

删除帖子或 Pack 会级联清理关联。一条悬赏结束或删除后，只要 Pack 仍有关联的其他有效悬赏，就继续保留标识。

## 部署与验证

必须先运行迁移，再部署后端代码；服务器不会自动改库。

```sh
cd D:/GitHub/jackhouse/backend
npm run migrate:post-bounties
npm test
```

迁移使用项目现有 DB 环境配置，可重复执行。也可由部署环境执行 `backend/sql/2026-10-05-post-bounties.sql`。
新增 post.bounty_closed_at、活动查询索引与 post_pack 关联表，保留现有帖子内容和类型。

测试覆盖活动期限、永久切换、权限、输入验证、富文本清理、事务失败、关闭幂等、编辑后关闭保持、列表组合筛选、分页 SQL 生成及迁移结构。开发过程中没有连接或修改现有数据库；实际 MariaDB 迁移和端到端联调需在部署或测试环境完成。
