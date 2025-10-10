const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const mysql = require('mysql2/promise');
require('dotenv').config();

// Database configuration
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kyna_admin',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

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

(async () => {
    try {
        console.log('🔄 Fetching credentials from database...');
        const { apiId, apiHash, sessionString } = await getCredentialsFromDB();
        
        console.log('🔄 Fetching groups to monitor...');
        const groupsToMonitor = await getGroupsToMonitor();
        
        if (groupsToMonitor.length === 0) {
            console.log('⚠️  No groups to monitor. Please configure groups in the admin dashboard.');
            process.exit(0);
        }

        console.log(`📋 Found ${groupsToMonitor.length} group(s) to monitor:`);
        groupsToMonitor.forEach(group => {
            console.log(`   - ${group.group_name} (ID: ${group.group_id})`);
        });

        // Create Telegram client
        const stringSession = new StringSession(sessionString);
        const client = new TelegramClient(stringSession, apiId, apiHash, { 
            connectionRetries: 5 
        });
        
        console.log('\n🔄 Connecting to Telegram...');
        await client.connect();
        
        console.log('✅ Connected to Telegram successfully!');
        console.log('⏰ Waiting for messages...\n');

        // Create a Set of group IDs for faster lookup
        const groupIds = new Set(groupsToMonitor.map(g => g.group_id));
        
        // Create a map for group names
        const groupNames = {};
        groupsToMonitor.forEach(group => {
            groupNames[group.group_id] = group.group_name;
        });

        // Set up event handler for new messages
        client.addEventHandler(async (update) => {
            if (update.className === 'UpdateNewMessage') {
                const msg = update.message;
                
                // Get the channel/chat ID from the message
                let groupId = null;
                if (msg.peerId.channelId) {
                    groupId = msg.peerId.channelId.toString();
                } else if (msg.peerId.chatId) {
                    groupId = msg.peerId.chatId.toString();
                }
                
                // Check if message is from one of our monitored groups
                if (groupId && groupIds.has(groupId)) {
                    try {
                        // Only process text messages, ignore media/sticker/gif
                        if (!msg.message || msg.message.trim() === '') {
                            return; // Skip non-text messages
                        }
                        
                        const messageText = msg.message.trim();
                        
                        // Get sender name
                        let senderName = 'Unknown';
                        try {
                            const sender = await msg.getSender();
                            if (sender) {
                                senderName = [sender.firstName, sender.lastName]
                                    .filter(Boolean)
                                    .join(' ') || sender.username || 'Unknown';
                            }
                        } catch (error) {
                            console.error('Error getting sender:', error.message);
                        }
                        
                        console.log(`${senderName}: ${messageText}`);
                        
                        // TODO: Push to queue
                        // await queue.push({
                        //     senderName,
                        //     message: messageText
                        // });
                    } catch (error) {
                        console.error('Error processing message:', error.message);
                    }
                }
            }
        });

        // Keep the script running
        console.log('✅ Watcher is running. Press Ctrl+C to stop.\n');
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
})();

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    await pool.end();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n🛑 Shutting down gracefully...');
    await pool.end();
    process.exit(0);
});
