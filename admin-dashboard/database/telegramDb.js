const mysql = require('mysql2/promise');
require('dotenv').config();

// Create database connection pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sports_admin',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

class TelegramDatabase {
    // Get all monitoring groups for all users
    async getMonitoringGroups() {
        try {
            const [groups] = await pool.execute(
                'SELECT tg.*, au.email as user_email FROM telegram_groups tg ' +
                'JOIN admin_users au ON tg.user_id = au.id ' +
                'WHERE tg.is_monitoring = TRUE'
            );
            return groups;
        } catch (error) {
            console.error('Error getting monitoring groups:', error);
            throw error;
        }
    }

    // Get monitoring groups for a specific user
    async getUserMonitoringGroups(userId) {
        try {
            const [groups] = await pool.execute(
                'SELECT * FROM telegram_groups WHERE user_id = ? AND is_monitoring = TRUE',
                [userId]
            );
            return groups;
        } catch (error) {
            console.error('Error getting user monitoring groups:', error);
            throw error;
        }
    }

    // Get user's Telegram session
    async getUserSession(userId) {
        try {
            const [sessions] = await pool.execute(
                'SELECT * FROM telegram_sessions WHERE user_id = ? AND is_verified = TRUE AND expires_at > NOW()',
                [userId]
            );
            return sessions.length > 0 ? sessions[0] : null;
        } catch (error) {
            console.error('Error getting user session:', error);
            throw error;
        }
    }

    // Get user's API credentials
    async getUserApiCredentials(userId) {
        try {
            const [credentials] = await pool.execute(
                'SELECT api_id, api_hash FROM telegram_api_credentials WHERE user_id = ?',
                [userId]
            );
            return credentials.length > 0 ? credentials[0] : null;
        } catch (error) {
            console.error('Error getting user API credentials:', error);
            throw error;
        }
    }

    // Get all active Telegram sessions
    async getAllActiveSessions() {
        try {
            const [sessions] = await pool.execute(
                'SELECT * FROM telegram_sessions WHERE is_verified = TRUE AND expires_at > NOW()'
            );
            return sessions;
        } catch (error) {
            console.error('Error getting all active sessions:', error);
            throw error;
        }
    }

    // Test database connection
    async testConnection() {
        try {
            const connection = await pool.getConnection();
            console.log('✅ Connected to MySQL database!');
            connection.release();
            return true;
        } catch (err) {
            console.error('❌ Error connecting to MySQL database:', err.message);
            return false;
        }
    }
}

module.exports = new TelegramDatabase();
