const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateAdmin);

// GET /settings - Render settings page
router.get('/', (req, res) => {
    res.render('settings/index', {
        title: 'Settings - Kyna Admin',
        currentPage: 'settings',
        user: req.user,
        session: req.session
    });
});

// POST /settings/update-email - Update user email
router.post('/update-email', async (req, res) => {
    try {
        const { newEmail } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!newEmail) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(newEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        // Check if new email is different from current
        if (newEmail === req.user.email) {
            return res.status(400).json({
                success: false,
                message: 'New email must be different from current email'
            });
        }

        // Check if email already exists
        const [existingUsers] = await pool.execute(
            'SELECT id FROM admin_users WHERE email = ? AND id != ?',
            [newEmail, userId]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'This email is already in use'
            });
        }

        // Update email
        await pool.execute(
            'UPDATE admin_users SET email = ? WHERE id = ?',
            [newEmail, userId]
        );

        // Update session user data
        req.user.email = newEmail;

        res.json({
            success: true,
            message: 'Email updated successfully',
            newEmail: newEmail
        });

    } catch (error) {
        console.error('Error updating email:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// POST /settings/update-password - Update user password
router.post('/update-password', async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!currentPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'All password fields are required'
            });
        }

        // Validate new password
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters long'
            });
        }

        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'New password and confirmation do not match'
            });
        }

        // Verify current password
        const [users] = await pool.execute(
            'SELECT password_hash FROM admin_users WHERE id = ?',
            [userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const isPasswordValid = await bcrypt.compare(currentPassword, users[0].password_hash);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await pool.execute(
            'UPDATE admin_users SET password_hash = ? WHERE id = ?',
            [hashedPassword, userId]
        );

        res.json({
            success: true,
            message: 'Password updated successfully'
        });

    } catch (error) {
        console.error('Error updating password:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

module.exports = router;
