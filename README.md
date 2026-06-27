# 4Key Jack House
<br />
<p align="center">
    <a href="https://www.jackhouse.xyz/">
        <img src="frontend/src/assets/pic/jackHouseLight.png" alt="Logo" width="320" height="80">
    </a>
</p>
<div align="center">
    A community for jack players
    <br />
    <br />

**[English](README.md)**
·
**[简体中文](README_zh.md)**
</div>

## 📁 Project Structure

- `frontend/`: Vue 3 SPA, including views, router, Vuex store, i18n files, reusable components, and API wrappers.
- `backend/`: Express + Sequelize service, including routes, controllers, models, auth middleware, file upload handling, and i18n messages.

This repository is the legacy implementation. The new React rewrite lives in `jack-house-v3`.

## 🛠️ Tech Stack

### Frontend

| Tech              | Description                                |
|-------------------|--------------------------------------------|
| Vue 3             | A JavaScript framework for building UIs    |
| Vite              | Next-generation frontend tooling           |
| Vue Router        | Official router for Vue.js                 |
| Vuex              | Official state management for Vue.js       |
| Element Plus      | A Vue 3 UI component library               |
| Tailwind CSS      | A utility-first CSS framework              |
| Axios             | Promise-based HTTP client                  |
| WangEditor        | Rich-text editor component                 |
| Vue-i18n          | Internationalization plugin for Vue.js     |

### Backend

| Technology           | Description                             |
|---------------------|---------------------------------------|
| Node.js             | JavaScript runtime environment        |
| Express.js          | Node.js web application framework     |
| Sequelize           | Promise-based Node.js ORM              |
| MariaDB             | Open-source relational database       |
| JWT                 | User authentication                   |
| Bcrypt.js           | Password hashing library               |
| Multer & MinIO      | File upload handling and object storage |
| Helmet & CORS       | Application security and cross-origin handling |
| Dotenv              | Environment variable management        |
| express-rate-limit  | Basic rate limiting middleware         |
| i18next             | Internationalization framework         |

## 🚀 Setup
Before you begin, make sure the following are available:

- Node.js
- npm
- MariaDB
- Required environment variables for backend services such as database, JWT, and MinIO

1. Clone the Repository
```sh
git clone https://github.com/1skyyks1/jackhouse.git

cd jackhouse
```

2. Backend Setup (/backend)
```sh
cd backend

npm install

npm start
```

3. Frontend Setup (/frontend)
```sh
cd frontend

npm install

npm run dev
```
