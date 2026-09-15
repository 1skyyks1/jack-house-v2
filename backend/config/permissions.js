/**
 * 系统权限点字典定义
 *
 * 设计说明：
 * 1. 采用扁平字符串格式，优先与前端已有的 Admin 页面/模块权限标识对齐（如 badges, events, posts 等），
 *    确保前端现有的 RequireAdminPermission 与导航权限检查零摩擦衔接。
 * 2. 支持扩展细粒度动作权限（如 badge:create、post:delete），并支持通配符 '*'（全局超管）。
 */

const PERMISSIONS = Object.freeze({
  // 全局通配符，拥有此权限可绕过所有权限检查
  ALL: '*',

  // 后台基础准入权限
  ADMIN_ACCESS: 'admin',

  // 数据仪表盘
  DASHBOARD: 'dashboard',

  // 活动与阶段管理
  EVENTS: 'events',
  EVENT_STAGES: 'eventStages',

  // 徽章发放与管理
  BADGES: 'badges',

  // 帖子与社区文章
  POSTS: 'posts',

  // 帖子文件/资源审核
  POST_FILES: 'postFiles',

  // 图包标签维护
  PACK_TAGS: 'packTags',
  PACK_MANAGE: 'pack:manage',
  PACK_DELETE: 'pack:delete',

  // 图包反馈处理
  PACK_FEEDBACK: 'packFeedback',

  // AI 图像生成与审核
  AI_IMAGES: 'aiImages',

  // 用户与权限管理
  USERS: 'users',

  // 积分/商城兑换
  REWARDS: 'rewards',

  // 全站公告管理
  ANNOUNCEMENT: 'announcement',

  // 赛事全局管理（区别于单场赛事的 Staff 身份）
  TOURNAMENTS: 'tournaments'
});

// 所有可用权限点列表，用于后台界面勾选展示或校验合法性
const ALL_PERMISSIONS_LIST = Object.values(PERMISSIONS).filter(p => p !== PERMISSIONS.ALL);

module.exports = {
  PERMISSIONS,
  ALL_PERMISSIONS_LIST
};
