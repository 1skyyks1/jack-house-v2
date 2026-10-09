# 精选 Pack 的 stable / lazer PP 后端

实现日期：2026-10-08。计算引擎固定为 `rosu-pp-js@4.0.1`，规则版本 `mania-4k-rosu-4.0.1-v1`。这是本站精选池 PP，包含官方没有账号 PP 的非 Ranked 谱面；不等于 osu! 账号总 PP。

首次迁移、回填和发布时（2026-10-08），核验了 68 个谱面文件、98 条成功结果；67 个 stable BP（18 名玩家）和 31 个 lazer BP（2 名玩家）。这些是当时的核验快照，后续同步会增加数据。前端已接入个人 PP、排名趋势、最佳 / 近期成绩和公开表现排行榜；服务需要加载本次后端代码后才能提供新路由和持续处理后续同步任务。

数据库安全核查：新增 PP 存储，原业务表未执行修改或删除。回填中发现的 8 小时日期偏移仅修正 `pp_score_attempt`，同时将新写入改为显式 UTC 文本。修正前后 `pack_score` 的完整记录摘要一致；原有 1,071 个 Pack、8,810 张谱面、98 条 Pack 成绩、105 条活动成绩、776 名用户记录数量一致。`npm run verify:pp` 在只读事务内验证结构、已收录成绩副本、谱面输入及 BP 唯一性；本次最终 98 条副本字段对应、时间差异为零。

## 计分规则

- 精选池使用 `pack.leaderboard_enabled = 1`，不另设谱面键数或半星资格筛选。
- stable 和 lazer 分开选 BP、计算总 PP、排名。每名玩家、每张谱面、每个客户端仅选最高 PP；同图跨 Pack 去重。
- 每套列表按 PP 降序，前 50 个贡献 `pp × 0.95^(位次−1)`；不足 50 个使用实际数量；其余 BP 和所有候选尝试保留。无图量奖励，没有两个客户端相加的总分。
- 客户端按来源判断：正数 `build_id` 为 lazer；legacy score ID 或 legacy 的 CL 标记为 stable。来源不能确认的记录保存但排除。
- 不使用显示 ACC 或游戏分数估算 PP。将六判定、Mods、客户端语义传给计算器；六判定缺省字段按零，整份缺失则排除。
- 必须是已通过成绩。六判定合计必须匹配原始谱面的客户端语义，且计算器输出不能更改原有判定。
- 初始回填仅包含已经保存的精选 `pack_score`。不恢复过去丢弃的尝试，也不扩大近 24 小时同步范围。

## Mods 与入榜资格

“能算出 PP”与“允许进入 BP / 总分”是两个检查。本站首版按已核验的官方 mania Mod 资格采用显式允许列表；其他设置不静默按 NM 计算。资格依据是 2026-10-08 的[官方 lazer 升级说明](https://osu.ppy.sh/wiki/en/Help_centre/Upgrading_to_lazer#will-all-mods-be-ranked)和规则源码。后续更改资格必须升级本站规则版本并重算。

| Mods | 处理 |
| --- | --- |
| NM、NF、EZ、HD、FI、FL、MR、SD、PF | 按客户端与完整设置计算；NF / EZ 的 PP 系数由引擎处理 |
| DT / NC | 默认 1.5 倍速度，重算难度；同速度下 NC 与 DT 的 PP 一致 |
| HT / DC | 默认 0.75 倍速度，重算难度；DC 仅接受 lazer 来源 |
| DT / HT 的 `adjust_pitch` | 允许音调选项变化，不改变难度或 PP |
| stable 的 CL 标记 | 接受，是 legacy 成绩表示方式 |
| lazer 的 AC / CO / MU | 接受经验证的自定义设置；不会额外增加 PP 倍率 |
| stable Score V2（SV2）、自动游玩等 | 保存候选，标记 `unranked_mod`，不进 BP |
| mania HR、lazer CL、DA、NR、HO、IN、RD、WU、WD、AS | 首版不入榜；保留明确排除原因 |
| 自定义 DT / NC / HT / DC 速度 | 计算层支持，但当前入榜规则仅接受默认速度；标记 `unranked_mod_settings` |
| 非默认 EZ 额外生命数、FL 可见范围 / 随 combo 变化 | 不入榜；默认值显式传入仍可接受 |
| 改键 Mods、未知 Mods / 设置、不兼容组合 | 首版排除，避免以错误语义计分 |

**lazer 普通成绩不会因采用类似 Score V2 的计分系统而被排除。** `SV2` 专指 stable 的 Score V2 标记。[官方 Score V2 实现](https://github.com/ppy/osu/blob/master/osu.Game/Rulesets/Mods/ModScoreV2.cs)。lazer 的 CL 即便被排除，客户端来源仍为 lazer，不改划到 stable。

## 数据库

迁移文件：`sql/2026-10-08-mania-pp.sql`，可重复执行，不改变原 `pack_score` 或游戏分数排行榜。

| 表 / 视图 | 用途 |
| --- | --- |
| `pp_rules` | 当前发布的算法版本、Top 50、0.95 衰减系数 |
| `pp_beatmap_source` | 原始 `.osu` 内容及 MD5、音符数、LN 数；旧文件保留 |
| `pp_score_attempt` | 不可变的候选成绩、六判定、完整 Mods、来源、谱面版本；唯一 `attempt_key` |
| `pp_score_result` | 每次尝试、每个规则版本的 PP 结果与持久队列状态；失败重试与任务租约 |
| `pp_difficulty` | 按 checksum、版本、客户端、Mods / 设置与速度保存难度属性和星级 |
| `pp_best_score` 视图 | 选出当前规则版本、当前精选池内的每人 / 每图 / 每客户端最高 PP |
| `pp_rank_history` | 按玩家 / 客户端 / 规则版本 / UTC 日期保存实际观察到的站内排名和总 PP |

视图通过 `ROW_NUMBER()` 强制每个分组只返回一条 BP，不需要在并发请求中维护容易过期的 BP 副本。个人总分与排名由同一套查询对当前 BP 加权得到，不持久化容易与池变化脱节的总分。取消精选或移除谱面后，它们立即退出总分；重新精选后可重新参与。删除玩家会级联删除该玩家候选及结果。

osu! score ID 以字符串保留；无 ID 的历史记录使用玩家、来源、谱面、时间、统计与 Mods 的稳定指纹。跨 Pack / 重复同步不重复创建尝试。候选快照不会被后一次同步覆盖。

原始谱面按 checksum 保存。成绩有 checksum 时必须匹配；无法取得对应旧文件则排除 `beatmap_version_unavailable`。旧成绩无 checksum 时，在首次成功计算时固定所用文件，并返回 `source_verified: false`，表示历史文件版本未能证明；后续重算继续使用固定文件，不自动切到新谱。对尚未固定文件的新成绩，无 checksum 的最新文件缓存有效期 24 小时。

数据库持久化难度属性用于审计与版本追踪。WASM 属性对象保留在计算线程内，最多缓存 64 组，淘汰时释放。进程重启后从持久原始文件重新构造 WASM 属性，不能将 JSON 直接当作 WASM 对象使用。个人 / 榜单查询不会下载谱面或运行 PP 计算。

## 同步与后台计算

原有单 Pack、全部精选 Pack 的同步接口会在按游戏分数删减之前捕获全部候选，与游戏分数入库同一事务提交。同步响应额外返回：

```json
{ "pp": { "candidates": 3, "algorithm_version": "mania-4k-rosu-4.0.1-v1", "asynchronous": true } }
```

`candidates` 是本次去重后的匹配候选数，包含已经保存的重复尝试，不代表新增数量。开启 Pack 精选时，会同时将已有原始分数记录送入 PP 队列。

服务器默认启动后台队列，每 5 秒领取最多 10 项。数据库原子租约支持多个后端进程；意外退出 10 分钟后回收任务。原始谱面下载和 WASM 计算在成绩事务之外执行；PP 的 CPU 计算位于独立工作线程。下载超时 20 秒，计算超时 30 秒，下载间隔至少 1.1 秒。结果、难度缓存和谱面固定信息在同一事务发布。

临时下载 / 计算失败进行指数退避，最多 5 次；之后状态 `failed`。输入不合法或 Mod 不入榜标记 `excluded`，不会自动重试。个人 PP 响应提供各状态数量，待计算的成绩不会暂时按零 PP 替换已有 BP。

可设置 `PP_WORKER_ENABLED=false`，改用独立 `npm run worker:pp` 进程；需保证至少一个队列处理进程持续运行。

## 查询接口

以下接口可匿名查询，只返回公开成绩和用户名 / 头像。`client` 必须是 `stable` 或 `lazer`；分页 `page` 从 1 开始，`pageSize` 默认 50、最大 50。

| 请求 | 内容 |
| --- | --- |
| `GET /user/:user_id/pp` | stable / lazer 各自总 PP、BP 数、计入数量、排名，以及队列状态数 |
| `GET /user/:user_id/pp/best?client=stable&page=1&pageSize=50` | 一套 BP List，含位次、原始 PP、权重、加权贡献、判定 / Mods、谱面与成绩来源 |
| `GET /user/:user_id/pp/history?client=stable` | 最近 90 个 UTC 日的真实排名记录；响应为 `data.history`，每项含 `date`、`rank`、`total_pp`、`recorded_at` |
| `GET /pp/leaderboard?client=lazer&page=1&pageSize=50` | 对应客户端的个人总 PP 排名，以及相对昨天的排名变化 |
| `GET /pp/beatmaps/:beatmap_id/leaderboard?client=stable` | 对应客户端在该图的 PP 最佳成绩排名 |

个人响应 `data.stable` 和 `data.lazer` 均含 `total_pp`、`bp_count`、`counted_bp_count`、`rank`。无 BP 时为零，排名为 `null`。BP 列表可分页查看第 50 名之后的成绩，此时 `weight` / `weighted_pp` 为零。同 PP / 总 PP 并列排名；BP 选择使用游玩时间及候选 ID 稳定消除同值歧义。计算过程中保留双精度，仅展示时四舍五入。

个人总 PP 排行榜的每行增加 `previous_rank` 和 `rank_change`。使用同一客户端、当前发布算法版本在昨天（UTC 日）的最后一次观察记录，`rank_change = previous_rank - rank`，正数表示上升、负数表示下降、零表示不变。昨天缺少记录或未上榜时均返回 `null`，不使用更早日期或其他版本补算。排名不变或暂无昨日记录时变化列均留空，并保留列宽；仅真实上升或下降时显示箭头和数字。变化列不显示悬停提示，保留读屏标签。复用现有 `pp_rank_history`，本次无需新增表或迁移。

排行榜每行还返回 `highest_pp`（当前客户端、当前算法版本、精选池中的最高原始单曲 PP）和 `grade_counts`（与个人页相同的全部已收录成绩等级统计）。等级统计对当前页玩家一次批量查询，每名玩家每张谱面每个客户端取游戏分数最高的成绩，不限定 BP 或精选池。前端宽屏（1024px 起）增加最高单曲 PP、SS、S 列；SS 合并 `SS` / `SSH`，S 合并 `S` / `SH`，不展示 A 数量，窄屏保持原有列。无需数据库迁移。

### 个人页联调与排名趋势（2026-10-08）

个人 PP 接口的 `stable`、`lazer` 统计均增加 `grade_counts`（`SSH`、`SS`、`SH`、`S`、`A`、`B`、`C`、`D`）。合并用户已有的 Pack 成绩、活动成绩和已通过的成绩快照，每张谱面每个客户端只计游戏分数最高的一次，跨 Pack / 活动去重；同分按记录时间、来源及 ID 稳定选取。不限定精选池、前 50、PP 可计分 Mods 或 PP 计算状态 / 算法版本。快照客户端未知、零分和缺少有效等级的记录不计入等级数量。成绩等级沿用成绩行图标规则，支持 `X` / `XH` 别名及 HD / FI / FL 银色等级。宽屏在排名、PP 右侧展示前五项，随客户端切换；无需数据库迁移。

最近成绩接口 `/user/:user_id/recent-scores` 额外返回该次成绩的 `pp` 和 `pp_status`。使用与 PP 入库相同的尝试指纹批量查询当前发布版本；不会把同图最高 PP 替换到游戏分数最高的另一条成绩上。只有 `ready` 返回数字（包含 0），其他状态返回 `null`；未关联到结果为 `unavailable`。`build_id = 0` 不标记为 lazer。

排名历史从启用此版本时开始记录，不能按过去的游玩日期倒推历史名次。服务器启动及每 15 分钟自动采样；PP worker 发布结果后请求采样，同一进程最多每分钟一次。同一天保留最近一次实际观察值，按 UTC 日期归档，版本之间隔离，不删除旧版本历史。曾参与但当前未上榜的玩家记录 `rank: null`；前端参照 osu-web 过滤无效排名点，按其余有效记录绘图。客户端分别统计，不合并。

前端图表为开放式排名趋势：无坐标文字、网格或外框，名次越小位置越高，纵向范围为最近 90 天有效记录（含当前排名）的最好 / 最差名次。参照 [osu-web 的排名图](https://github.com/ppy/osu-web/blob/master/resources/js/profile-page/rank-chart.tsx)，不足 90 天时按有效点的时间范围铺满宽度，以当前排名作为今天的端点；仅一个有效记录时，复制其排名到前一天的绘图位置，显示水平线。这个补点不写入数据库，悬浮提示仍显示实际观察日期。没有历史且当前未上榜时保持空状态。新版图表上线前需在对应数据库运行 `npm run migrate:pp` 并重启后端；该迁移额外创建排名历史表，保留已有业务数据。

## 安装、迁移和回填

### 个人页默认客户端

用户在修改个人信息的「个人页展示」中保存 `default_pp_client`（`stable` 或 `lazer`）。该设置随账号存储，通过公开用户详情和当前用户接口返回；自己与其他访客查看这名用户的个人页时使用其设置的默认客户端。头部切换仅影响当前页面查看，不写入账号设置；进入另一名用户的页面时重新使用对方的默认值。

部署包含此设置的后端前运行 `npm run migrate:user-profile-client`。迁移只给 `user` 表新增带默认值 `stable` 的字段，不修改已有资料、成绩或 PP；可重复执行。已有用户及新用户均默认 Stable，用户可在资料设置中自行修改。

在后端目录执行：

```sh
npm ci
npm run migrate:pp
npm run migrate:user-profile-client
npm run backfill:pp
```

然后启动或重启后端，加载路由与队列。迁移不自动在服务器启动时执行。`backfill:pp` 先导入现有精选成绩，再处理当前可以领取的队列；若临时失败尚在退避，需持续运行 worker 或待退避后 `drain:pp`。命令输出聚合计数，不输出数据库凭据或玩家成绩快照。

维护命令：

```sh
npm run drain:pp        # 处理当前到期的任务后退出
npm run retry:pp        # 重新排队失败 / 待重试任务，不覆盖已完成结果
npm run worker:pp       # 持续处理队列
npm run recalculate:pp  # 为当前代码规则版本补齐所有候选的任务
npm run publish:pp      # 当前版本全部 ready / excluded 后，原子切换发布版本
npm run verify:pp       # 只读核查数据库结构、原成绩副本和 PP 结果
```

升级计算器或入榜规则时，应更改 `ALGORITHM_VERSION` 并固定新依赖版本；先迁移 / 更新工作进程、执行 `recalculate:pp`、处理队列，最后 `publish:pp`。迁移使用 `INSERT IGNORE`，不会提前切换已有发布版本。未完成任务或仍有失败时拒绝发布；不能直接重置当前已发布结果造成榜单逐条混用新旧规则。滚回旧版本可恢复 `pp_rules.algorithm_version`，旧版本结果与原文件保留。

## 验证

`npm test` 包含 PP 单元测试和原有后端回归测试。数据库集成测试默认跳过，可在迁移和回填后显式启用：

```powershell
$env:PP_DB_TEST='true'
node --test test/mania-pp-db.test.js
Remove-Item Env:PP_DB_TEST
```

集成测试的人工 BP 使用事务并最终回滚，不留下模拟成绩；另外验证真实双客户端总分、公开 HTTP 接口与重复同步幂等行为。测试需要当前配置数据库中至少 60 张精选谱面和一个没有 PP 成绩的现有玩家。
