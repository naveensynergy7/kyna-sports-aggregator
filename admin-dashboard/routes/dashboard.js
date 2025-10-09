const express = require('express');
const { pool } = require('../config/database');

const router = express.Router();

// Dashboard home page
router.get('/', async (req, res) => {
    try {
        // Get admin user info
        const [users] = await pool.execute(
            'SELECT email, created_at FROM admin_users WHERE id = ?',
            [req.session.adminId]
        );

        // Get session info
        const [sessions] = await pool.execute(
            'SELECT created_at, expires_at FROM admin_sessions WHERE user_id = ? AND session_token = ?',
            [req.session.adminId, req.session.sessionToken]
        );

        const user = users[0];
        const session = sessions[0];

        res.render('dashboard/index', {
            title: 'Admin Dashboard',
            user: user,
            session: session
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.render('error', {
            title: 'Error',
            message: 'Failed to load dashboard'
        });
    }
});

module.exports = router;
