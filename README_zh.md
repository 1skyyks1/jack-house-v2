# 4Key Jack House
<br />
<p align="center">
    <a href="https://www.jackhouse.xyz/">
        <img src="frontend/src/assets/pic/jackHouseLight.png" alt="Logo" width="320" height="80">
    </a>
</p>
<div align="center">
    一个为叠键玩家打造的社区
    <br />
    <br />

**[English](README.md)**
·
**[简体中文](README_zh.md)**
</div>

## 📁 项目结构

- `frontend/`：Vue 3 单页应用，包含页面、路由、Vuex、国际化、可复用组件和前端 API 封装。
- `backend/`：Express + Sequelize 服务，包含路由、控制器、模型、鉴权中间件、文件上传和国际化错误消息。

这个仓库是旧实现，新的 React 重构版位于 `jack-house-v3`。

## 🛠️ 技术栈

### 前端

| 技术         | 描述                               |
|--------------|----------------------------------|
| Vue 3        | JavaScript 框架 |
| Vite         | 前端构建工具                 |
| Vue Router   | Vue.js 官方路由管理器              |
| Vuex         | Vue.js 官方状态管理库              |
| Element Plus | Vue 3 UI 组件库               |
| Tailwind CSS | CSS 框架              |
| Axios        | 基于 Promise 的 HTTP 客户端        |
| WangEditor   | 富文本编辑器                       |
| Vue-i18n     | Vue.js 国际化插件                  |

### 后端

| 技术               | 描述                             |
|------------------|--------------------------------|
| Node.js          | JavaScript 运行环境             |
| Express.js       | Node.js Web 应用框架            |
| Sequelize        | 基于 Promise 的 Node.js ORM     |
| MariaDB          | 开源关系型数据库                 |
| JWT              | 用户认证                        |
| Bcrypt.js        | 密码哈希库                     |
| Multer & MinIO   | 文件上传处理与对象存储           |
| Helmet & CORS    | 应用安全与跨域处理               |
| Dotenv           | 环境变量管理                   |
| express-rate-limit | 基础的速率限制中间件           |
| i18next          | 国际化框架                     |

## 🚀 安装
开始前请确认以下依赖已经具备：

- Node.js
- npm
- MariaDB
- 后端所需环境变量，例如数据库、JWT、MinIO 等配置

1. 克隆仓库
```sh
git clone https://github.com/1skyyks1/jackhouse.git

cd jackhouse
```

2. 后端配置 (/backend)
```sh
cd backend

npm install

npm start
```

3. 前端配置 (/frontend)
```sh
cd frontend

npm install

npm run dev
```
