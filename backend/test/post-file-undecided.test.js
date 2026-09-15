const assert = require('node:assert/strict');
const test = require('node:test');
const { PostFile, User } = require('../models');
const postFileController = require('../controllers/post/postFileController');

test('reviewPostFile accepts status 3 (undecided) and rejects invalid status values', async () => {
    // 模拟 PostFile 实例
    let updatedStatus = null;
    let updatedFeedback = null;

    const originalFindByPk = PostFile.findByPk;
    PostFile.findByPk = async (id) => {
        if (id === 1) {
            return {
                file_id: 1,
                // 上传时间设为 48 小时前，确保已锁定
                uploaded_time: new Date(Date.now() - 48 * 3600 * 1000),
                status: 0,
                feedback: null,
                update: async ({ status, feedback }) => {
                    updatedStatus = status;
                    updatedFeedback = feedback;
                },
            };
        }
        return null;
    };

    try {
        // 1. 测试合法审核为待定 (status: 3)
        const reqSuccess = {
            params: { file_id: 1 },
            body: { status: 3, feedback: '待定：谱面需与其他审稿人讨论' },
            t: (k) => k,
        };
        let resJson = null;
        let resStatus = 200;
        const resSuccess = {
            status: (code) => { resStatus = code; return resSuccess; },
            json: (data) => { resJson = data; return resSuccess; },
        };

        await postFileController.reviewPostFile(reqSuccess, resSuccess);
        assert.equal(resStatus, 200);
        assert.equal(updatedStatus, 3);
        assert.equal(updatedFeedback, '待定：谱面需与其他审稿人讨论');

        // 2. 测试非法状态值被拦截 (status: 4)
        let invalidResStatus = null;
        let invalidResJson = null;
        const resInvalid = {
            status: (code) => { invalidResStatus = code; return resInvalid; },
            json: (data) => { invalidResJson = data; return resInvalid; },
        };
        await postFileController.reviewPostFile({
            params: { file_id: 1 },
            body: { status: 4 },
            t: (k) => k,
        }, resInvalid);

        assert.equal(invalidResStatus, 400);
        assert.equal(invalidResJson.message, 'postFile.invalidStatus');
    } finally {
        PostFile.findByPk = originalFindByPk;
    }
});

test('getFileByPostAndUser masks undecided status (3) as pending (0) for submitters while preserving for reviewers', async () => {
    const originalFindAll = PostFile.findAll;
    PostFile.findAll = async () => [
        {
            file_id: 101,
            post_id: 5,
            user_id: 10,
            status: 3, // 内部待定
            feedback: '内部备忘：后续再确认',
            toJSON: () => ({
                file_id: 101,
                post_id: 5,
                user_id: 10,
                status: 3,
                feedback: '内部备忘：后续再确认',
            }),
        },
        {
            file_id: 102,
            post_id: 5,
            user_id: 10,
            status: 1, // 已通过
            feedback: '通过通过',
            toJSON: () => ({
                file_id: 102,
                post_id: 5,
                user_id: 10,
                status: 1,
                feedback: '通过通过',
            }),
        },
    ];

    try {
        // 1. 普通投稿人（无 postFiles 权限）查询
        const submitterReq = {
            params: { post_id: 5 },
            user: { user_id: 10, permissions: [] },
            t: (k) => k,
        };
        let submitterResData = null;
        const submitterRes = {
            json: (payload) => { submitterResData = payload; },
            status: () => submitterRes,
        };

        await postFileController.getFileByPostAndUser(submitterReq, submitterRes);
        assert.ok(submitterResData && submitterResData.data);
        const maskedFile = submitterResData.data.find((f) => f.file_id === 101);
        const passedFile = submitterResData.data.find((f) => f.file_id === 102);

        // 待定应脱敏为 0，反馈清空为 null
        assert.equal(maskedFile.status, 0);
        assert.equal(maskedFile.feedback, null);
        // 已通过保持原样
        assert.equal(passedFile.status, 1);
        assert.equal(passedFile.feedback, '通过通过');

        // 2. 审稿人（具有 postFiles 权限）查询
        const reviewerReq = {
            params: { post_id: 5 },
            user: { user_id: 99 },
            userPermissions: new Set(['postFiles']),
            t: (k) => k,
        };
        let reviewerResData = null;
        const reviewerRes = {
            json: (payload) => { reviewerResData = payload; },
            status: () => reviewerRes,
        };

        await postFileController.getFileByPostAndUser(reviewerReq, reviewerRes);
        assert.ok(reviewerResData && reviewerResData.data);
        const reviewerFile = reviewerResData.data.find((f) => f.file_id === 101);

        // 审稿人应能看到真实的待定状态 3 和内部反馈
        assert.equal(reviewerFile.status, 3);
        assert.equal(reviewerFile.feedback, '内部备忘：后续再确认');
    } finally {
        PostFile.findAll = originalFindAll;
    }
});

test('getFileByUserId masks undecided status (3) as pending (0) for public callers', async () => {
    const originalFindAndCountAll = PostFile.findAndCountAll;
    PostFile.findAndCountAll = async () => ({
        count: 1,
        rows: [
            {
                file_id: 201,
                post_id: 8,
                user_id: 15,
                status: 3,
                feedback: '内部讨论中',
                toJSON: () => ({
                    file_id: 201,
                    post_id: 8,
                    user_id: 15,
                    status: 3,
                    feedback: '内部讨论中',
                }),
            },
        ],
    });

    try {
        // 未登录或普通访客查询
        const publicReq = {
            params: { user_id: 15 },
            query: { page: 1, pageSize: 10 },
            user: null,
            t: (k) => k,
        };
        let publicResData = null;
        const publicRes = {
            json: (payload) => { publicResData = payload; },
            status: () => publicRes,
        };

        await postFileController.getFileByUserId(publicReq, publicRes);
        assert.ok(publicResData && publicResData.data);
        assert.equal(publicResData.data[0].status, 0);
        assert.equal(publicResData.data[0].feedback, null);
    } finally {
        PostFile.findAndCountAll = originalFindAndCountAll;
    }
});
