const mysql = require('mysql2/promise');
const path = require('path');
// Load .env from app root (1 level up: config -> app)
// In Docker, .env is mounted to /app/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kyna_admin',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection()
    .then(connection => {
        console.log('✅ Connected to MySQL database!');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Error connecting to MySQL database:', err.message);
        process.exit(1); // Exit process if database connection fails
    });

module.exports = { pool };