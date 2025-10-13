const express = require('express');
const { pool } = require('../config/database');
const { authenticateAdmin } = require('../middleware/auth');
const { Api, TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const crypto = require('crypto');

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticateAdmin);

// Store user sessions (in production, use a proper database)
const userSessions = new Map();

// Helper function to get session key for user
const getSessionKey = (userId) => `user_${userId}`;

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

        // Automatically restart watcher after saving API credentials
        try {
            console.log('🔄 Auto-restarting watcher after API credentials save...');
            const watcherUrl = process.env.WATCHER_URL || 'http://localhost:3001';
            
            const restartResponse = await fetch(`${watcherUrl}/restart`, {
                method: 'POST'
            });
            
            const restartData = await restartResponse.json();
            
            if (restartData.success) {
                console.log('✅ Watcher restarted successfully after API credentials save');
            } else {
                console.log('⚠️ Watcher restart failed after API credentials save:', restartData.message);
            }
        } catch (restartError) {
            console.error('❌ Error auto-restarting watcher after API credentials save:', restartError.message);
            // Don't fail the credentials save if restart fails
        }

        res.json({
            success: true,
            message: 'API credentials saved successfully and watcher restarted'
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
                'SELECT * FROM telegram_sessions WHERE user_id = ? AND is_verified = TRUE',
                [req.user.id]
            );

        if (sessions.length > 0) {
            const session = sessions[0];
            res.json({
                success: true,
                session: {
                    id: session.id,
                    phone_number: session.phone_number,
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
                timeout: 30000, // 30 seconds timeout
                retryDelay: 1000, // 1 second delay between retries
                useWSS: false, // Use TCP instead of WebSocket for better stability
                floodSleepThreshold: 60, // Handle flood errors better
            });

            await client.connect();

            // Send code request using your working method
            const result = await client.invoke(
                new Api.auth.SendCode({
                    apiId: userApiId,
                    apiHash: userApiHash,
                    phoneNumber: phone,
                    settings: new Api.CodeSettings({
                        allowFlashcall: false,
                        currentNumber: false,
                        allowAppHash: false,
                    }),
                })
            );

            console.log('OTP sent successfully:', result);
            console.log('Code type:', result.type.className);
            console.log('Phone code hash:', result.phoneCodeHash);

            // Store session data in Map (like your working code) - KEEP CLIENT CONNECTED
            const sessionKey = getSessionKey(req.user.id);
            userSessions.set(sessionKey, {
                client,
                apiId: userApiId,
                apiHash: userApiHash,
                phoneCodeHash: result.phoneCodeHash,
                phoneNumber: phone,
                stringSession
            });

            // DON'T disconnect - keep client connected for verification

            let message = 'OTP sent! Please check your messages.';
            let codeType = 'unknown';
            
            if (result.type && result.type.className === 'SentCodeTypeApp') {
                message = `OTP sent to your Telegram app! Check "Telegram" messages in your app. Code length: ${result.type.length} digits.`;
                codeType = 'app';
            } else if (result.type && result.type.className === 'SentCodeTypeSms') {
                message = `OTP sent via SMS! Check your text messages. Code length: ${result.type.length} digits.`;
                codeType = 'sms';
            } else if (result.type && result.type.className === 'SentCodeTypeCall') {
                message = 'You will receive a phone call with the code.';
                codeType = 'call';
            }

            res.json({
                success: true,
                message: message,
                phone: phone,
                codeType: codeType,
                codeLength: result.type.length || 5,
                phoneCodeHash: result.phoneCodeHash.substring(0, 6) + '...' // Show partial for debugging
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

// Resend OTP via SMS
router.post('/resend-code-sms', async (req, res) => {
    try {
        const { phone } = req.body;
        
        // Get session data from Map
        const sessionKey = getSessionKey(req.user.id);
        const userSession = userSessions.get(sessionKey);
        
        if (!userSession || userSession.phoneNumber !== phone) {
            return res.status(400).json({
                success: false,
                message: 'Please start authentication first'
            });
        }

        try {
            const { client, phoneCodeHash } = userSession;

            // Request code to be resent via SMS using your working method
            const result = await client.invoke(
                new Api.auth.ResendCode({
                    phoneNumber: phone,
                    phoneCodeHash: phoneCodeHash
                })
            );

            console.log('Code resent:', result);

            // Update session with new phone code hash
            userSession.phoneCodeHash = result.phoneCodeHash;

            // DON'T disconnect - keep client connected

            let message = 'Code resent!';
            if (result.type && result.type.className === 'SentCodeTypeSms') {
                message = 'OTP sent via SMS! Check your text messages.';
            } else if (result.type && result.type.className === 'SentCodeTypeApp') {
                message = 'OTP sent to your Telegram app!';
            }

            res.json({
                success: true,
                message: message,
                codeType: result.type.className
            });
        } catch (telegramError) {
            console.error('Error resending code:', telegramError);
            
            let errorMessage = 'Failed to resend code. Please try again later.';
            
            if (telegramError.errorMessage === 'PHONE_CODE_EXPIRED') {
                errorMessage = 'The previous code has expired. Please click "Send OTP" again to get a fresh code.';
                // Clear the expired session data from Map
                userSessions.delete(sessionKey);
            }
            
            res.status(400).json({
                success: false,
                message: errorMessage,
                expired: telegramError.errorMessage === 'PHONE_CODE_EXPIRED'
            });
        }
    } catch (error) {
        console.error('Error resending code:', error);
        res.status(500).json({
            success: false,
            message: 'Error resending code'
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

        // Get session data from Map (like your working code)
        const sessionKey = getSessionKey(req.user.id);
        const userSession = userSessions.get(sessionKey);
        
        if (!userSession || userSession.phoneNumber !== phone) {
            return res.status(400).json({
                success: false,
                message: 'Please click "Send OTP" first to receive the code.'
            });
        }

        try {
            const { client, apiId, apiHash, phoneCodeHash, phoneNumber } = userSession;

            // Sign in with phone code using your working method
            const result = await client.invoke(
                new Api.auth.SignIn({
                    apiId: apiId,
                    apiHash: apiHash,
                    phoneNumber: phoneNumber,
                    phoneCodeHash: phoneCodeHash,
                    phoneCode: otp,
                })
            );

            console.log('Sign in successful:', result);

            // Get session string
            const sessionString = client.session.save();

            // Save session to database (no expiry - Telegram sessions extend automatically)
            // Check if user already has a session
            const [existingSessions] = await pool.execute(
                'SELECT * FROM telegram_sessions WHERE user_id = ?',
                [req.user.id]
            );

            if (existingSessions.length > 0) {
                // Update existing session
                await pool.execute(
                    'UPDATE telegram_sessions SET phone_number = ?, session_string = ?, is_verified = TRUE, expires_at = NULL WHERE user_id = ?',
                    [phone, sessionString, req.user.id]
                );
            } else {
                // Create new session
                await pool.execute(
                    'INSERT INTO telegram_sessions (user_id, phone_number, session_string, is_verified, expires_at) VALUES (?, ?, ?, TRUE, NULL)',
                    [req.user.id, phone, sessionString]
                );
            }

            // Clear session data from Map
            userSessions.delete(sessionKey);

            // Disconnect client
            await client.disconnect();

            // Automatically restart watcher after successful login
            try {
                console.log('🔄 Auto-restarting watcher after Telegram login...');
                const watcherUrl = process.env.WATCHER_URL || 'http://localhost:3001';
                
                const restartResponse = await fetch(`${watcherUrl}/restart`, {
                    method: 'POST'
                });
                
                const restartData = await restartResponse.json();
                
                if (restartData.success) {
                    console.log('✅ Watcher restarted successfully after login');
                } else {
                    console.log('⚠️ Watcher restart failed after login:', restartData.message);
                }
            } catch (restartError) {
                console.error('❌ Error auto-restarting watcher after login:', restartError.message);
                // Don't fail the login if restart fails
            }

            res.json({
                success: true,
                message: 'Telegram connected successfully and watcher restarted',
                session: {
                    phone_number: phone
                }
            });
        } catch (telegramError) {
            console.error('Telegram authentication error:', telegramError);
            
            let errorMessage = 'Invalid OTP. Please check and try again.';
            let expired = false;
            
            // Handle specific Telegram errors
            if (telegramError.errorMessage === 'PHONE_CODE_INVALID') {
                errorMessage = 'Invalid OTP code. Please check the code and try again.';
            } else if (telegramError.errorMessage === 'PHONE_CODE_EXPIRED') {
                errorMessage = 'OTP code has expired. Please click "Send OTP" again to get a fresh code.';
                expired = true;
                // Clear the expired session data from Map
                userSessions.delete(sessionKey);
            } else if (telegramError.errorMessage === 'PHONE_NUMBER_INVALID') {
                errorMessage = 'Invalid phone number. Please try again.';
            } else if (telegramError.errorMessage === 'SESSION_PASSWORD_NEEDED') {
                errorMessage = '2FA is enabled on your account. This is not yet supported.';
            }
            
            res.status(400).json({
                success: false,
                message: errorMessage,
                expired: expired
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
            'SELECT * FROM telegram_sessions WHERE user_id = ? AND is_verified = TRUE',
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
                timeout: 30000, // 30 seconds timeout
                retryDelay: 1000, // 1 second delay between retries
                useWSS: false, // Use TCP instead of WebSocket for better stability
                floodSleepThreshold: 60, // Handle flood errors better
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
            'SELECT * FROM telegram_sessions WHERE user_id = ? AND is_verified = TRUE',
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
                timeout: 30000, // 30 seconds timeout
                retryDelay: 1000, // 1 second delay between retries
                useWSS: false, // Use TCP instead of WebSocket for better stability
                floodSleepThreshold: 60, // Handle flood errors better
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
                    'Group', // Simplified group name to avoid encoding issues
                    group.username,
                    true // is_monitoring
                ]);

                const placeholders = values.map(() => '(?, ?, ?, ?, ?)').join(', ');
                const flatValues = values.flat();

                try {
                    await pool.execute(
                        `INSERT INTO telegram_groups (user_id, group_id, group_name, username, is_monitoring) VALUES ${placeholders}`,
                        flatValues
                    );
                } catch (dbError) {
                    console.error('Database error saving groups:', dbError);
                    
                    // If it's a character encoding error, try with sanitized names
                    if (dbError.code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
                        console.log('Retrying with sanitized group names...');
                        
                        const sanitizedValues = selectedGroups.map(group => [
                            req.user.id,
                            group.group_id,
                            'Group', // Simplified group name to avoid encoding issues
                            group.username,
                            true
                        ]);

                        const sanitizedPlaceholders = sanitizedValues.map(() => '(?, ?, ?, ?, ?)').join(', ');
                        const sanitizedFlatValues = sanitizedValues.flat();

                        await pool.execute(
                            `INSERT INTO telegram_groups (user_id, group_id, group_name, username, is_monitoring) VALUES ${sanitizedPlaceholders}`,
                            sanitizedFlatValues
                        );
                    } else {
                        throw dbError; // Re-throw if it's not a character encoding issue
                    }
                }
            }

            await client.disconnect();

            // Automatically restart watcher after saving groups
            try {
                console.log('🔄 Auto-restarting watcher after group save...');
                const watcherUrl = process.env.WATCHER_URL || 'http://localhost:3001';
                
                const restartResponse = await fetch(`${watcherUrl}/restart`, {
                    method: 'POST'
                });
                
                const restartData = await restartResponse.json();
                
                if (restartData.success) {
                    console.log('✅ Watcher restarted successfully');
                } else {
                    console.log('⚠️ Watcher restart failed:', restartData.message);
                }
            } catch (restartError) {
                console.error('❌ Error auto-restarting watcher:', restartError.message);
                // Don't fail the group save if restart fails
            }

            res.json({
                success: true,
                message: 'Groups saved successfully and watcher restarted',
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

// Reload watcher groups
router.post('/reload-watcher', async (req, res) => {
    try {
        const watcherUrl = process.env.WATCHER_URL || 'http://localhost:3001';
        
        // Call watcher's reload endpoint
        const response = await fetch(`${watcherUrl}/reload`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error reloading watcher:', error);
        res.status(500).json({
            success: false,
            message: 'Error communicating with watcher. Make sure it is running.'
        });
    }
});

// Get watcher status
router.get('/watcher-status', async (req, res) => {
    try {
        const watcherUrl = process.env.WATCHER_URL || 'http://localhost:3001';
        
        const response = await fetch(`${watcherUrl}/status`);
        const data = await response.json();
        
        res.json(data);
    } catch (error) {
        console.error('Error getting watcher status:', error);
        res.json({
            success: false,
            isConnected: false,
            message: 'Watcher is not running'
        });
    }
});

module.exports = router;
