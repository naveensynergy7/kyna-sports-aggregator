const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { generateSessionToken } = require('../middleware/auth');

const router = express.Router();

// Login page
router.get('/login', (req, res) => {
    if (req.session.adminId) {
        return res.redirect('/dashboard');
    }
    res.render('auth/login', { 
        title: 'Admin Login',
        error: req.session.error || null
    });
    delete req.session.error;
});

// Handle login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find admin user
        const [users] = await pool.execute(
            'SELECT * FROM admin_users WHERE email = ? AND is_active = TRUE',
            [email]
        );

        if (users.length === 0) {
            req.session.error = 'Invalid email or password';
            return res.redirect('/auth/login');
        }

        const user = users[0];

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            req.session.error = 'Invalid email or password';
            return res.redirect('/auth/login');
        }

        // Generate session token
        const sessionToken = generateSessionToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Create session
        await pool.execute(
            'INSERT INTO admin_sessions (user_id, session_token, expires_at) VALUES (?, ?, ?)',
            [user.id, sessionToken, expiresAt]
        );

        // Store in session
        req.session.adminId = user.id;
        req.session.sessionToken = sessionToken;

        res.redirect('/dashboard');
    } catch (error) {
        console.error('Login error:', error);
        req.session.error = 'Login failed. Please try again.';
        res.redirect('/auth/login');
    }
});

// Logout
router.post('/logout', async (req, res) => {
    try {
        if (req.session.adminId && req.session.sessionToken) {
            // Remove session from database
            await pool.execute(
                'DELETE FROM admin_sessions WHERE user_id = ? AND session_token = ?',
                [req.session.adminId, req.session.sessionToken]
            );
        }
        
        req.session.destroy();
        res.redirect('/auth/login');
    } catch (error) {
        console.error('Logout error:', error);
        req.session.destroy();
        res.redirect('/auth/login');
    }
});

module.exports = router;
