const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const mysql = require('mysql2/promise');
const express = require('express');
const path = require('path');
// Load .env from app root
// In Docker, .env is mounted to /app/.env
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Create Express app for control API
const app = express();
app.use(express.json());
const CONTROL_PORT = process.env.WATCHER_CONTROL_PORT || 3001;

// Database configuration
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

// Global variables for managing the watcher
let client = null;
let groupIds = new Set();
let groupNames = {};
let isConnected = false;
let eventHandler = null; // Store the event handler reference

// Fetch credentials and session from database
async function getCredentialsFromDB() {
    try {
        // Get API credentials
        const [credentials] = await pool.execute(
            'SELECT api_id, api_hash FROM telegram_api_credentials LIMIT 1'
        );
        
        if (credentials.length === 0) {
            throw new Error('No API credentials found in database');
        }

        // Get session string
        const [sessions] = await pool.execute(
            'SELECT session_string FROM telegram_sessions WHERE is_verified = TRUE LIMIT 1'
        );
        
        if (sessions.length === 0) {
            throw new Error('No active Telegram session found in database');
        }

        return {
            apiId: parseInt(credentials[0].api_id),
            apiHash: credentials[0].api_hash,
            sessionString: sessions[0].session_string
        };
    } catch (error) {
        console.error('❌ Error fetching credentials from database:', error.message);
        throw error;
    }
}

// Fetch groups to monitor from database
async function getGroupsToMonitor() {
    try {
        const [groups] = await pool.execute(
            'SELECT group_id, group_name FROM telegram_groups WHERE is_monitoring = TRUE'
        );
        
        if (groups.length === 0) {
            console.log('⚠️  No groups are currently set to monitoring in the database');
            return [];
        }

        return groups;
    } catch (error) {
        console.error('❌ Error fetching groups from database:', error.message);
        throw error;
    }
}

// Setup event handler for message monitoring
function setupEventHandler() {
    // Remove old event handler if it exists
    if (eventHandler && client) {
        try {
            client.removeEventHandler(eventHandler);
        } catch (e) {
            // Ignore errors if handler doesn't exist
        }
    }

    // Define the event handler
    eventHandler = async (update) => {
        try {
            // Skip if update or className is undefined
            if (!update || !update.className) {
                return;
            }
            
            // Handle both UpdateNewMessage and UpdateNewChannelMessage
            if (update.className === 'UpdateNewMessage' || update.className === 'UpdateNewChannelMessage') {
                const msg = update.message;
                
                // Get the channel/chat ID from the message
                let groupId = null;
                if (msg.peerId) {
                    if (msg.peerId.channelId) {
                        groupId = msg.peerId.channelId.toString();
                    } else if (msg.peerId.chatId) {
                        groupId = msg.peerId.chatId.toString();
                    } else if (msg.peerId.userId) {
                        // Skip private messages
                        return;
                    }
                }
                
                // Check if message is from one of our monitored groups
                if (groupId && groupIds.has(groupId)) {
                    // Only process text messages, ignore media/sticker/gif
                    if (!msg.message || msg.message.trim() === '') {
                        return;
                    }
                    
                    const messageText = msg.message.trim();
                    
                    // Get sender name (async operation, so we'll handle it properly)
                    (async () => {
                        try {
                            let senderName = 'Unknown';
                            
                            try {
                                const sender = await client.getEntity(msg.senderId);
                                if (sender) {
                                    console.log('DEBUG - Sender object:', {
                                        firstName: sender.firstName,
                                        lastName: sender.lastName,
                                        username: sender.username,
                                        phone: sender.phone,
                                        id: sender.id
                                    });
                                    
                                    // Try to build full name from first and last name
                                    const firstName = sender.firstName || '';
                                    const lastName = sender.lastName || '';
                                    const fullName = [firstName, lastName].filter(Boolean).join(' ');
                                    
                                    // Prioritize: username > full name > phone > fallback to ID
                                    senderName = sender.username || 
                                                fullName || 
                                                sender.phone;
                                }
                            } catch (senderError) {
                                // Fallback to sender ID if we can't get entity
                                senderName = `User${msg.username}`;
                            }
                            
                            // Log the message with group name and sender
                            console.log(`[${groupNames[groupId]}] ${senderName}: ${messageText}`);
                            
                            // TODO: Push to queue
                            // await queue.push({
                            //     groupId,
                            //     groupName: groupNames[groupId],
                            //     senderName,
                            //     message: messageText
                            // });
                        } catch (error) {
                            console.error('Error processing message:', error.message);
                        }
                    })();
                }
            }
        } catch (error) {
            console.error('Error in event handler:', error.message);
        }
    };

    // Add the event handler to the client
    client.addEventHandler(eventHandler);
}

// Reload groups from database
async function reloadGroups() {
    try {
        console.log('\n🔄 Reloading groups from database...');
        const groupsToMonitor = await getGroupsToMonitor();
        
        // Update global Sets and Maps
        groupIds.clear();
        groupNames = {};
        
        groupsToMonitor.forEach(group => {
            groupIds.add(group.group_id);
            groupNames[group.group_id] = group.group_name;
        });
        
        console.log(`📋 Loaded ${groupsToMonitor.length} group(s) to monitor:`);
        groupsToMonitor.forEach(group => {
            console.log(`   - ${group.group_name} (ID: ${group.group_id})`);
        });
        
        // Re-register the event handler with updated groups
        if (client && isConnected) {
            setupEventHandler();
            console.log('✅ Event handler re-registered with updated groups');
        }
        
        return {
            success: true,
            count: groupsToMonitor.length,
            groups: groupsToMonitor
        };
    } catch (error) {
        console.error('❌ Error reloading groups:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Initialize and connect to Telegram
async function initializeTelegramClient() {
    try {
        console.log('🔄 Fetching credentials from database...');
        const { apiId, apiHash, sessionString } = await getCredentialsFromDB();
        
        console.log('🔄 Fetching groups to monitor...');
        const groupsToMonitor = await getGroupsToMonitor();
        
        if (groupsToMonitor.length === 0) {
            console.log('⚠️  No groups to monitor. Please configure groups in the admin dashboard.');
            console.log('💡 The watcher will automatically restart when you save groups.');
            return false;
        }

        console.log(`📋 Found ${groupsToMonitor.length} group(s) to monitor:`);
        groupsToMonitor.forEach(group => {
            console.log(`   - ${group.group_name} (ID: ${group.group_id})`);
        });

        // Create Telegram client
        const stringSession = new StringSession(sessionString);
        client = new TelegramClient(stringSession, apiId, apiHash, { 
            connectionRetries: 5 
        });
        
        console.log('\n🔄 Connecting to Telegram...');
        
        // Use client.start() instead of client.connect() to properly initialize updates
  await client.start({
            phoneNumber: async () => '', // Empty, we already have session
            password: async () => '',
            phoneCode: async () => '',
            onError: (err) => console.log('Connection error:', err),
  });
  
  console.log('✅ Connected to Telegram successfully!');
        console.log('⏰ Waiting for messages...\n');

        // Initialize global Sets and Maps
        groupsToMonitor.forEach(group => {
            groupIds.add(group.group_id);
            groupNames[group.group_id] = group.group_name;
        });

        // Setup event handler for message monitoring
        setupEventHandler();

        isConnected = true;
        return true;
        
    } catch (error) {
        console.error('❌ Error initializing Telegram client:', error.message);
        isConnected = false;
        return false;
    }
}

// Control API endpoints
app.get('/status', (req, res) => {
    res.json({
        success: true,
        isConnected,
        monitoringCount: groupIds.size,
        groups: Array.from(groupIds).map(id => ({
            id,
            name: groupNames[id]
        }))
    });
});

app.post('/reload', async (req, res) => {
    const result = await reloadGroups();
    res.json(result);
});

app.post('/restart', async (req, res) => {
    try {
        console.log('\n🔄 Restart requested via API...');
        
        // Disconnect if connected
        if (client && isConnected) {
            console.log('🔌 Disconnecting current client...');
            await client.disconnect();
            isConnected = false;
        }
        
        // Reinitialize
        const success = await initializeTelegramClient();
        
        res.json({
            success,
            message: success ? 'Watcher restarted successfully' : 'Failed to restart watcher'
        });
    } catch (error) {
        console.error('❌ Error restarting watcher:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Start control API server
app.listen(CONTROL_PORT, () => {
    console.log(`🎛️  Control API listening on port ${CONTROL_PORT}`);
    console.log(`   Status: http://localhost:${CONTROL_PORT}/status`);
    console.log(`   Reload Groups: POST http://localhost:${CONTROL_PORT}/reload`);
    console.log(`   Restart Watcher: POST http://localhost:${CONTROL_PORT}/restart\n`);
});

// Initialize on startup
(async () => {
    const success = await initializeTelegramClient();
    if (!success) {
        console.log('\n⚠️  Watcher not fully initialized. Waiting for configuration...');
        console.log('   Use the control API to restart once configured.\n');
    } else {
        console.log('✅ Watcher is running. Press Ctrl+C to stop.\n');
  }
})();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    if (client && isConnected) {
        await client.disconnect();
    }
    await pool.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    if (client && isConnected) {
        await client.disconnect();
    }
    await pool.end();
    process.exit(0);
});
