const express = require('express');
const { pool } = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');
const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const crypto = require('crypto');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateAdmin);

// Get user's API credentials
router.get('/api-credentials', async (req, res) => {
    try {
        const [credentials] = await pool.execute(
            'SELECT api_id, api_hash FROM telegram_api_credentials WHERE user_id = ?',
            [req.user.id]
        );

        if (credentials.length > 0) {
            res.json({
                success: true,
                credentials: {
                    api_id: credentials[0].api_id,
                    api_hash: credentials[0].api_hash
                }
            });
        } else {
            res.json({
                success: true,
                credentials: null
            });
        }
    } catch (error) {
        console.error('Error getting API credentials:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting API credentials'
        });
    }
});

// Save user's API credentials
router.post('/save-api-credentials', async (req, res) => {
    try {
        const { api_id, api_hash } = req.body;
        
        if (!api_id || !api_hash) {
            return res.status(400).json({
                success: false,
                message: 'API ID and API Hash are required'
            });
        }

        // Check if user already has credentials
        const [existingCredentials] = await pool.execute(
            'SELECT * FROM telegram_api_credentials WHERE user_id = ?',
            [req.user.id]
        );

        if (existingCredentials.length > 0) {
            // Update existing credentials
            await pool.execute(
                'UPDATE telegram_api_credentials SET api_id = ?, api_hash = ? WHERE user_id = ?',
                [api_id, api_hash, req.user.id]
            );
        } else {
            // Create new credentials
            await pool.execute(
                'INSERT INTO telegram_api_credentials (user_id, api_id, api_hash) VALUES (?, ?, ?)',
                [req.user.id, api_id, api_hash]
            );
        }

        res.json({
            success: true,
            message: 'API credentials saved successfully'
        });
    } catch (error) {
        console.error('Error saving API credentials:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving API credentials'
        });
    }
});

// Check Telegram session status
router.get('/session-status', async (req, res) => {
    try {
        const [sessions] = await pool.execute(
            'SELECT * FROM telegram_sessions WHERE user_id = ? AND is_verified = TRUE AND expires_at > NOW()',
            [req.user.id]
        );

        if (sessions.length > 0) {
            const session = sessions[0];
            res.json({
                success: true,
                session: {
                    id: session.id,
                    phone_number: session.phone_number,
                    expires_at: session.expires_at,
                    created_at: session.created_at
                }
            });
        } else {
            res.json({
                success: false,
                message: 'No active Telegram session'
            });
        }
    } catch (error) {
        console.error('Error checking Telegram session:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking session status'
        });
    }
});

// Start Telegram authentication process
router.post('/start-auth', async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Phone number is required'
            });
        }

        // Get user's API credentials
        const [credentials] = await pool.execute(
            'SELECT api_id, api_hash FROM telegram_api_credentials WHERE user_id = ?',
            [req.user.id]
        );

        if (credentials.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'API credentials not found. Please configure your Telegram API credentials first.'
            });
        }

        const userApiId = parseInt(credentials[0].api_id);
        const userApiHash = credentials[0].api_hash;

        try {
            // Initialize Telegram client
            const stringSession = new StringSession('');
            const client = new TelegramClient(stringSession, userApiId, userApiHash, {
                connectionRetries: 5,
            });

            // Connect to Telegram
            await client.connect();

            // Send the code request - this triggers OTP to be sent
            const result = await client.sendCode({
                apiId: userApiId,
                apiHash: userApiHash,
            }, phone);

            console.log('OTP sent successfully:', result);

            // Store phone and code hash in session
            req.session.telegramPhone = phone;
            req.session.telegramPhoneCodeHash = result.phoneCodeHash;
            req.session.telegramAuthInProgress = true;

            await client.disconnect();

            let message = 'OTP sent! Please check your messages.';
            if (result.isCodeViaApp) {
                message = 'OTP sent to your Telegram app! Please check your Telegram app for the login code.';
            }

            res.json({
                success: true,
                message: message,
                phone: phone,
                isCodeViaApp: result.isCodeViaApp || false
            });
        } catch (telegramError) {
            console.error('Error sending OTP:', telegramError);
            
            let errorMessage = 'Failed to send OTP. Please try again.';
            
            if (telegramError.seconds) {
                const hours = Math.floor(telegramError.seconds / 3600);
                const minutes = Math.floor((telegramError.seconds % 3600) / 60);
                errorMessage = `Rate limited. Please wait ${hours}h ${minutes}m or use a different number.`;
            } else if (telegramError.errorMessage === 'PHONE_NUMBER_INVALID') {
                errorMessage = 'Invalid phone number format. Use international format (e.g., +1234567890).';
            }
            
            res.status(400).json({
                success: false,
                message: errorMessage
            });
        }
    } catch (error) {
        console.error('Error starting auth:', error);
        res.status(500).json({
            success: false,
            message: 'Error starting authentication'
        });
    }
});

// Verify OTP and create session
router.post('/verify-otp', async (req, res) => {
    try {
        const { otp, phone } = req.body;
        
        if (!otp || !phone) {
            return res.status(400).json({
                success: false,
                message: 'OTP and phone number are required'
            });
        }

        // Check if we have the phone code hash from start-auth
        if (!req.session.telegramPhoneCodeHash || req.session.telegramPhone !== phone) {
            return res.status(400).json({
                success: false,
                message: 'Please click "Send OTP" first to receive the code.'
            });
        }

        try {
            // Get user's API credentials
            const [credentials] = await pool.execute(
                'SELECT api_id, api_hash FROM telegram_api_credentials WHERE user_id = ?',
                [req.user.id]
            );

            if (credentials.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'API credentials not found. Please configure your Telegram API credentials first.'
                });
            }

            const userApiId = parseInt(credentials[0].api_id);
            const userApiHash = credentials[0].api_hash;

            // Initialize Telegram client with empty session
            const stringSession = new StringSession('');
            const client = new TelegramClient(stringSession, userApiId, userApiHash, {
                connectionRetries: 5,
            });

            // Connect and sign in using the phone code hash
            await client.connect();

            // Sign in with the OTP code
            await client.signInUser({
                apiId: userApiId,
                apiHash: userApiHash,
            }, {
                phoneNumber: phone,
                phoneCodeHash: req.session.telegramPhoneCodeHash,
                phoneCode: otp,
                onError: (err) => console.error('Sign in error:', err),
            });

            // Get session string
            const sessionString = client.session.save();

            // Save session to database
            const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

            // Check if user already has a session
            const [existingSessions] = await pool.execute(
                'SELECT * FROM telegram_sessions WHERE user_id = ?',
                [req.user.id]
            );

            if (existingSessions.length > 0) {
                // Update existing session
                await pool.execute(
                    'UPDATE telegram_sessions SET phone_number = ?, session_string = ?, is_verified = TRUE, expires_at = ? WHERE user_id = ?',
                    [phone, sessionString, expiresAt, req.user.id]
                );
            } else {
                // Create new session
                await pool.execute(
                    'INSERT INTO telegram_sessions (user_id, phone_number, session_string, is_verified, expires_at) VALUES (?, ?, ?, TRUE, ?)',
                    [req.user.id, phone, sessionString, expiresAt]
                );
            }

            // Clear auth session
            delete req.session.telegramPhone;
            delete req.session.telegramPhoneCodeHash;
            delete req.session.telegramAuthInProgress;

            // Disconnect client
            await client.disconnect();

            res.json({
                success: true,
                message: 'Telegram connected successfully',
                session: {
                    phone_number: phone,
                    expires_at: expiresAt
                }
            });
        } catch (telegramError) {
            console.error('Telegram authentication error:', telegramError);
            res.status(400).json({
                success: false,
                message: 'Failed to authenticate with Telegram. Please check your OTP and try again.'
            });
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({
            success: false,
            message: 'Error verifying OTP'
        });
    }
});

// Get Telegram groups
router.get('/groups', async (req, res) => {
    try {
        // Get user's Telegram session
        const [sessions] = await pool.execute(
            'SELECT * FROM telegram_sessions WHERE user_id = ? AND is_verified = TRUE AND expires_at > NOW()',
            [req.user.id]
        );

        if (sessions.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No active Telegram session'
            });
        }

        const session = sessions[0];

        try {
            // Get user's API credentials
            const [credentials] = await pool.execute(
                'SELECT api_id, api_hash FROM telegram_api_credentials WHERE user_id = ?',
                [req.user.id]
            );

            if (credentials.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'API credentials not found. Please configure your Telegram API credentials first.'
                });
            }

            const userApiId = parseInt(credentials[0].api_id);
            const userApiHash = credentials[0].api_hash;

            // Initialize Telegram client with saved session using user's credentials
            const stringSession = new StringSession(session.session_string);
            const client = new TelegramClient(stringSession, userApiId, userApiHash, {
                connectionRetries: 5,
            });

            await client.connect();

            // Get user's dialogs (chats, groups, channels)
            const dialogs = await client.getDialogs();
            
            // Filter for groups and channels
            const groups = dialogs
                .filter(dialog => {
                    const entity = dialog.entity;
                    return entity.className === 'Channel' && 
                           (entity.megagroup || entity.broadcast || entity.gigagroup);
                })
                .map(dialog => {
                    const entity = dialog.entity;
                    return {
                        id: entity.id.toString(),
                        name: entity.title,
                        username: entity.username || null
                    };
                });

            // Get saved groups from database
            const [savedGroups] = await pool.execute(
                'SELECT group_id, is_monitoring FROM telegram_groups WHERE user_id = ?',
                [req.user.id]
            );

            const savedGroupsMap = new Map();
            savedGroups.forEach(group => {
                savedGroupsMap.set(group.group_id, group.is_monitoring);
            });

            // Mark which groups are being monitored
            const groupsWithStatus = groups.map(group => ({
                ...group,
                is_monitoring: savedGroupsMap.get(group.id) || false
            }));

            await client.disconnect();

            res.json({
                success: true,
                groups: groupsWithStatus
            });
        } catch (telegramError) {
            console.error('Telegram API error:', telegramError);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch groups from Telegram'
            });
        }
    } catch (error) {
        console.error('Error fetching groups:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching groups'
        });
    }
});

// Save selected groups
router.post('/save-groups', async (req, res) => {
    try {
        const { groupIds } = req.body;
        
        if (!Array.isArray(groupIds)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid group IDs format'
            });
        }

        // Get user's Telegram session
        const [sessions] = await pool.execute(
            'SELECT * FROM telegram_sessions WHERE user_id = ? AND is_verified = TRUE AND expires_at > NOW()',
            [req.user.id]
        );

        if (sessions.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No active Telegram session'
            });
        }

        const session = sessions[0];

        try {
            // Get user's API credentials
            const [credentials] = await pool.execute(
                'SELECT api_id, api_hash FROM telegram_api_credentials WHERE user_id = ?',
                [req.user.id]
            );

            if (credentials.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'API credentials not found. Please configure your Telegram API credentials first.'
                });
            }

            const userApiId = parseInt(credentials[0].api_id);
            const userApiHash = credentials[0].api_hash;

            // Initialize Telegram client using user's credentials
            const stringSession = new StringSession(session.session_string);
            const client = new TelegramClient(stringSession, userApiId, userApiHash, {
                connectionRetries: 5,
            });

            await client.connect();

            // Get group details for selected groups
            const dialogs = await client.getDialogs();
            const selectedGroups = dialogs
                .filter(dialog => {
                    const entity = dialog.entity;
                    return entity.className === 'Channel' && 
                           groupIds.includes(entity.id.toString());
                })
                .map(dialog => {
                    const entity = dialog.entity;
                    return {
                        group_id: entity.id.toString(),
                        group_name: entity.title,
                        username: entity.username || null
                    };
                });

            // Clear existing groups for this user
            await pool.execute(
                'DELETE FROM telegram_groups WHERE user_id = ?',
                [req.user.id]
            );

            // Insert selected groups
            if (selectedGroups.length > 0) {
                const values = selectedGroups.map(group => [
                    req.user.id,
                    group.group_id,
                    group.group_name,
                    group.username,
                    true // is_monitoring
                ]);

                const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(', ');
                const flatValues = values.flat();

                await pool.execute(
                    `INSERT INTO telegram_groups (user_id, group_id, group_name, username, is_monitoring) VALUES ${placeholders}`,
                    flatValues
                );
            }

            await client.disconnect();

            res.json({
                success: true,
                message: 'Groups saved successfully',
                savedCount: selectedGroups.length
            });
        } catch (telegramError) {
            console.error('Telegram API error:', telegramError);
            res.status(500).json({
                success: false,
                message: 'Failed to save groups'
            });
        }
    } catch (error) {
        console.error('Error saving groups:', error);
        res.status(500).json({
            success: false,
            message: 'Error saving groups'
        });
    }
});

// Disconnect Telegram
router.post('/disconnect', async (req, res) => {
    try {
        // Delete user's Telegram session
        await pool.execute(
            'DELETE FROM telegram_sessions WHERE user_id = ?',
            [req.user.id]
        );

        // Delete user's saved groups
        await pool.execute(
            'DELETE FROM telegram_groups WHERE user_id = ?',
            [req.user.id]
        );

        res.json({
            success: true,
            message: 'Telegram disconnected successfully'
        });
    } catch (error) {
        console.error('Error disconnecting Telegram:', error);
        res.status(500).json({
            success: false,
            message: 'Error disconnecting Telegram'
        });
    }
});

module.exports = router;
