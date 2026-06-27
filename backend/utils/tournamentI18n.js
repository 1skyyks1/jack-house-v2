const messageKeyMap = {
    '赛事不存在': 'tournament.errors.notFound',
    '服务器错误': 'common.serverError',
    '请先登录': 'authMid.pleaseLogin',
    '无权限访问': 'authMid.permissionDenied',
    '无权限执行此操作': 'authMid.permissionDenied',
    '权限检查失败': 'tournament.errors.permissionCheckFailed',
    '只有创建者 host 可以执行此操作': 'tournament.errors.creatorHostOnly',
    '删除成功': 'tournament.messages.deleteSuccess',
    '已移除': 'tournament.messages.removed',
    '加入成功': 'tournament.messages.joinSuccess',
    '已离开队伍': 'tournament.messages.leftTeam',
    '已移除队员': 'tournament.messages.playerRemoved',
    '已批量通过': 'tournament.messages.teamsApproved',
    '请输入谱面链接': 'tournament.errors.beatmapUrlRequired',
    '链接格式无效，请使用 osu.ppy.sh/beatmapsets/... 格式': 'tournament.errors.beatmapUrlInvalid',
    '链接中缺少谱面 ID，请使用完整链接（包含 #mania/xxx）': 'tournament.errors.beatmapIdMissing',
    '谱面不存在': 'tournament.errors.beatmapNotFound',
    '比赛不存在': 'tournament.errors.matchNotFound',
    '对局不存在': 'tournament.errors.gameNotFound',
    '请先设置 MP 房间 ID': 'tournament.errors.mpIdRequired',
    '无法获取比赛数据': 'tournament.errors.fetchMatchFailed',
    '分数获取完成': 'tournament.messages.scoresFetched',
    'Roll 点已记录': 'tournament.messages.rollRecorded',
    '操作已记录': 'tournament.messages.actionRecorded',
    '操作已更新': 'tournament.messages.actionUpdated',
    '红队已用过暂停': 'tournament.errors.team1TimeoutUsed',
    '蓝队已用过暂停': 'tournament.errors.team2TimeoutUsed',
    '暂停已记录': 'tournament.messages.timeoutRecorded',
    '比分已更新': 'tournament.messages.scoreUpdated',
    '不支持撤销，请直接修改对应操作': 'tournament.errors.undoUnsupported',
    '轮次不存在': 'tournament.errors.roundNotFound',
    '不在报名时间内': 'tournament.errors.registrationClosed',
    '你已经在一支队伍中': 'tournament.errors.alreadyInTeam',
    '赛事 staff 不能报名参赛，请先由 host 手动处理 staff 记录': 'tournament.errors.staffCannotRegister',
    '用户不存在': 'user.notFound',
    '请先绑定 osu 账号': 'tournament.errors.osuNotBound',
    '队伍已锁定，无法修改成员': 'tournament.errors.teamLocked',
    '队伍名称不能为空': 'tournament.errors.teamNameRequired',
    '队伍不存在': 'tournament.errors.teamNotFound',
    '只有队长可以提交队伍': 'tournament.errors.captainSubmitOnly',
    '队伍人数不符合赛事要求': 'tournament.errors.teamSizeInvalid',
    '缺少队伍或邀请码': 'tournament.errors.teamOrInviteRequired',
    '邀请码无效': 'tournament.errors.inviteInvalid',
    '该队伍需要邀请码': 'tournament.errors.inviteRequired',
    '队伍已满': 'tournament.errors.teamFull',
    '你不在任何队伍中': 'tournament.errors.notInTeam',
    '队长不能离开，请先移除其他队员': 'tournament.errors.captainCannotLeave',
    '只有队长可以移除队员': 'tournament.errors.captainKickOnly',
    '队员不存在': 'tournament.errors.playerNotFound',
    '不能移除队长': 'tournament.errors.cannotKickCaptain',
    '只有队长可以重置邀请码': 'tournament.errors.captainResetInviteOnly',
    '公开队伍不需要邀请码': 'tournament.errors.openTeamNoInvite',
    '只有队长可以修改队伍信息': 'tournament.errors.captainEditOnly',
    '只有队长可以转让队长': 'tournament.errors.captainTransferOnly',
    '目标队员不存在': 'tournament.errors.targetPlayerNotFound',
    '选手不存在': 'tournament.errors.playerNotFound',
    '无效的选手审查状态': 'tournament.errors.invalidReviewStatus',
    '无效的队伍状态': 'tournament.errors.invalidTeamStatus',
    '操作类型无效': 'tournament.errors.invalidActionType',
    '队伍不属于本场比赛': 'tournament.errors.teamNotInMatch',
    '缺少执行队伍': 'tournament.errors.actionTeamRequired',
    '图不存在或不属于本赛事': 'tournament.errors.mapNotInTournament',
    '该图已经被保护': 'tournament.errors.mapAlreadyProtected',
    '该图已经被禁用，不能保护': 'tournament.errors.bannedMapCannotProtect',
    '该图已经被选择，不能保护': 'tournament.errors.pickedMapCannotProtect',
    '已保护的图不能禁用': 'tournament.errors.protectedMapCannotBan',
    '该图已经被禁用': 'tournament.errors.mapAlreadyBanned',
    '该图已经被选择，不能禁用': 'tournament.errors.pickedMapCannotBan',
    '已禁用的图不能选择': 'tournament.errors.bannedMapCannotPick',
    '该图已经被选择': 'tournament.errors.mapAlreadyPicked',
    '操作不存在': 'tournament.errors.actionNotFound',
    '用户 ID 无效': 'tournament.errors.invalidUserId',
    '无效的角色': 'tournament.errors.invalidRole',
    '只有创建者 host 可以添加其他 host': 'tournament.errors.creatorAddHostOnly',
    '该用户已参赛，请先由 host 手动处理队伍/选手记录后再添加 staff': 'tournament.errors.staffUserAlreadyPlayer',
    '该用户已拥有此角色': 'tournament.errors.staffRoleExists',
    'Staff 不存在': 'tournament.errors.staffNotFound',
    '只有创建者 host 可以移除 host': 'tournament.errors.creatorRemoveHostOnly',
    '资格赛排名已锁定，无法继续修改资格赛数据': 'tournament.errors.qualifierLocked',
    '本届赛事暂无队伍': 'tournament.errors.noTeams',
    '资格赛 stage 必须是 1 到 7 的整数': 'tournament.errors.qualifierStageInvalid',
    '该资格赛 stage 已存在谱面': 'tournament.errors.qualifierStageExists',
    '该资格赛谱面已存在': 'tournament.errors.qualifierMapExists',
    '谱面 artist、title 和 mapper 不能为空': 'tournament.errors.mapMetadataRequired',
    '图不存在': 'tournament.errors.mapNotFound',
    '谱面 artist 不能为空': 'tournament.errors.artistRequired',
    '谱面 title 不能为空': 'tournament.errors.titleRequired',
    '谱面 mapper 不能为空': 'tournament.errors.mapperRequired',
    '该资格赛图已有成绩，不能直接删除': 'tournament.errors.qualifierMapHasScores',
    '缺少 MP ID': 'tournament.errors.mpIdRequired',
    '队伍 ID 无效': 'tournament.errors.invalidTeamId',
    '资格赛图池为空': 'tournament.errors.qualifierMappoolEmpty',
    '队伍成员未绑定 osu 账号': 'tournament.errors.teamMemberOsuMissing',
    '本届队伍成员未绑定 osu 账号': 'tournament.errors.tournamentMemberOsuMissing',
    '成绩获取完成': 'tournament.messages.scoresFetched',
    '排名计算完成': 'tournament.messages.rankingCalculated',
    '成绩无效': 'tournament.errors.invalidScore',
    '成绩不存在': 'tournament.errors.scoreNotFound',
    '资格赛排名已锁定': 'tournament.messages.rankingLocked',
    '后续比赛已有结果，无法自动覆盖对阵，请先人工处理后续比赛': 'tournament.errors.bracketOverwriteBlocked',
    '请先锁定资格赛排名，再生成正赛对阵': 'tournament.errors.lockRankingBeforeBracket',
    '首期正赛仅支持 32 强': 'tournament.errors.bracketSizeUnsupported',
    '32 强双败对阵生成完成': 'tournament.messages.bracketGenerated',
    'ID 无效': 'tournament.errors.invalidId',
    '无效的 bracket type': 'tournament.errors.invalidBracketType',
    'FT 必须是 1 到 15 的整数': 'tournament.errors.firstToInvalid',
    '轮次顺序无效': 'tournament.errors.roundOrderInvalid',
    '轮次名称不能为空': 'tournament.errors.roundNameRequired',
    '轮次已有比赛或图池，不能直接删除；请先重建或清理相关数据': 'tournament.errors.roundDeleteBlocked',
    'Beatmap ID 无效': 'tournament.errors.invalidBeatmapId',
    '该轮次已存在此谱面': 'tournament.errors.roundMapExists',
    '缺少轮次': 'tournament.errors.roundRequired',
    '比赛双方不能是同一支队伍': 'tournament.errors.sameTeamMatch',
    '无效的比赛结果类型': 'tournament.errors.invalidResultType',
    '胜方不属于本场比赛': 'tournament.errors.winnerNotInMatch',
    'WBD/FF 需要指定胜方': 'tournament.errors.wbdWinnerRequired',
    '不支持的内容类型': 'tournament.errors.unsupportedContentType',
    '不支持的内容格式': 'tournament.errors.unsupportedContentFormat',
    '内容标题不能为空': 'tournament.errors.contentTitleRequired',
    '内容不存在': 'tournament.errors.contentNotFound',
    'batch_id 不能为空': 'tournament.errors.batchIdRequired',
    'teams 必须是非空数组': 'tournament.errors.teamsArrayRequired',
    '单次最多导入 128 支队伍': 'tournament.errors.maxImportTeams',
    '导入非站内选手时 user_name 不能为空': 'tournament.errors.externalUserNameRequired',
    'player 必须是对象': 'tournament.errors.playerObjectRequired',
};

function translateTerm(req, value) {
    const termKeyMap = {
        '长度': 'tournament.terms.length',
        '星级': 'tournament.terms.star',
        '权重': 'tournament.terms.weight',
        '开始时间': 'tournament.terms.startTime',
        '结束时间': 'tournament.terms.endTime',
        '红队': 'tournament.terms.redTeam',
        '蓝队': 'tournament.terms.blueTeam',
    };
    const key = termKeyMap[value];
    return key ? req.t(key) : value;
}

function isEnglishRequest(req) {
    const language = req?.language || req?.i18n?.language || req?.headers?.['accept-language'];
    return typeof language === 'string' && language.toLowerCase().startsWith('en');
}

const messagePatternMap = [
    [/^(.+) 必须是整数$/, (req, match) => req.t('tournament.errors.mustBeInteger', { field: translateTerm(req, match[1]) })],
    [/^(.+)必须是正数$/, (req, match) => req.t('tournament.errors.mustBePositive', { field: translateTerm(req, match[1]) })],
    [/^(.+)不能为负数$/, (req, match) => req.t('tournament.errors.mustNotBeNegative', { field: translateTerm(req, match[1]) })],
    [/^(.+)必须是正整数$/, (req, match) => req.t('tournament.errors.mustBePositiveInteger', { field: translateTerm(req, match[1]) })],
    [/^(.+)无效$/, (req, match) => req.t('tournament.errors.fieldInvalid', { field: translateTerm(req, match[1]) })],
    [/^(.+)不存在或不属于本赛事$/, (req, match) => req.t('tournament.errors.teamNotInTournament', { field: translateTerm(req, match[1]) })],
    [/^用户 (.+) 不存在$/, (req, match) => req.t('tournament.errors.userValueNotFound', { user: match[1] })],
    [/^用户 (.+) 已经在本赛事中$/, (req, match) => req.t('tournament.errors.userAlreadyInTournament', { user: match[1] })],
    [/^导入批次中存在重复选手：(.+)$/, (req, match) => req.t('tournament.errors.duplicatePlayerInBatch', { user: match[1] })],
    [/^无效的选手审查状态：(.+)$/, (req, match) => req.t('tournament.errors.invalidReviewStatusValue', { status: match[1] })],
    [/^teams\[(\d+)\] 必须是对象$/, (req, match) => req.t('tournament.errors.teamImportItemObjectRequired', { index: match[1] })],
    [/^teams\[(\d+)\]\.name 不能为空$/, (req, match) => req.t('tournament.errors.teamImportNameRequired', { index: match[1] })],
    [/^(.+) 至少需要 1 名选手$/, (req, match) => req.t('tournament.errors.teamNeedsPlayer', { team: match[1] })],
    [/^(.+) 单队最多导入 16 名选手$/, (req, match) => req.t('tournament.errors.teamImportPlayerLimit', { team: match[1] })],
    [/^(.+) 的 status 无效$/, (req, match) => req.t('tournament.errors.teamStatusInvalidValue', { team: match[1] })],
    [/^(.+) 中存在重复选手：(.+)$/, (req, match) => req.t('tournament.errors.duplicatePlayerInTeam', { team: match[1], player: match[2] })],
    [/^队伍已存在：(.+)$/, (req, match) => req.t('tournament.errors.teamAlreadyExists', { team: match[1] })],
    [/^正赛需要 (\d+) 支通过资格的队伍，当前只有 (\d+) 支$/, (req, match) => req.t('tournament.errors.bracketQualifiedTeamsRequired', { required: match[1], current: match[2] })],
    [/^锁榜需要 (\d+) 支通过正赛资格的队伍，当前只有 (\d+) 支$/, (req, match) => req.t('tournament.errors.lockQualifiedTeamsRequired', { required: match[1], current: match[2] })],
    [/^正赛图池类型无效，仅支持 (.+)$/, (req, match) => req.t('tournament.errors.mainStageMapTypeInvalid', { types: match[1] })],
    [/^导入 (\d+) 条成绩，跳过 (\d+) 条重复成绩$/, (req, match) => req.t('tournament.messages.importedScores', { saved: match[1], skipped: match[2] })],
];

function translateMessage(req, message) {
    if (!message || !req?.t) return message;
    const key = messageKeyMap[message];
    if (key) return req.t(key);
    for (const [pattern, formatter] of messagePatternMap) {
        const match = message.match(pattern);
        if (match) return formatter(req, match);
    }
    if (isEnglishRequest(req) && /[\u4e00-\u9fff]/.test(message)) {
        return req.t('tournament.errors.operationFailed');
    }
    return message;
}

function errorMessage(req, error) {
    if (!error?.status) return req.t('common.serverError');
    return translateMessage(req, error.message);
}

function sendError(res, req, error) {
    console.error(error);
    res.status(error.status || 500).json({
        message: errorMessage(req, error)
    });
}

function translatePayload(req, payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
    if (typeof payload.message !== 'string') return payload;
    return {
        ...payload,
        message: translateMessage(req, payload.message)
    };
}

module.exports = {
    errorMessage,
    sendError,
    translatePayload,
    translateMessage
};
