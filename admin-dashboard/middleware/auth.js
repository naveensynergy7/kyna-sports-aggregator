const { pool } = require('../config/database');
const crypto = require('crypto');

// Check if admin is logged in
const authenticateAdmin = async (req, res, next) => {
    try {
        if (!req.session.adminId) {
            // Check if this is an API request
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }
            return res.redirect('/auth/login');
        }

        // Verify session exists in database
        const [sessions] = await pool.execute(
            'SELECT * FROM admin_sessions WHERE user_id = ? AND session_token = ? AND expires_at > NOW()',
            [req.session.adminId, req.session.sessionToken]
        );

        if (sessions.length === 0) {
            req.session.destroy();
            // Check if this is an API request
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    success: false,
                    error: 'Session expired'
                });
            }
            return res.redirect('/auth/login');
        }

        // Get user data
        const [users] = await pool.execute('SELECT id, email FROM admin_users WHERE id = ?', [req.session.adminId]);
        
        if (users.length === 0) {
            req.session.destroy();
            // Check if this is an API request
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({
                    success: false,
                    error: 'User not found'
                });
            }
            return res.redirect('/auth/login');
        }

        req.user = users[0];
        req.sessionData = sessions[0];
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        // Check if this is an API request
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({
                success: false,
                error: 'Authentication error'
            });
        }
        res.redirect('/auth/login');
    }
};

// Generate session token
const generateSessionToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

module.exports = {
    authenticateAdmin,
    generateSessionToken
};
