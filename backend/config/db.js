require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      dialect: 'mariadb',
      dialectOptions: {
        charset: 'utf8mb4',
        connectTimeout: Number(process.env.DB_CONNECT_TIMEOUT_MS) || 15000
      },
      define: {
        charset: 'utf8mb4',
        collate: 'utf8mb4_general_ci'
      }
});

module.exports = sequelize;
