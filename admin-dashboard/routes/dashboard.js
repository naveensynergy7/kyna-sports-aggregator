const express = require('express');
const { pool } = require('../config/database');
const { exec } = require('child_process');
const fs = require('fs').promises;
const util = require('util');

const router = express.Router();
const execAsync = util.promisify(exec);

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

// API endpoint to fetch parser logs
router.get('/api/parser-logs', async (req, res) => {
    try {
        console.log('Parser logs API called');
        
        let logs = [];
        let useRealLogs = false;
        
        // Try to read from log file first
        try {
            const logFilePath = '/app/parser-logs/parser-queue.log';
            const logContent = await fs.readFile(logFilePath, 'utf8');
            
            if (logContent && logContent.trim()) {
                console.log('Successfully read real logs from file');
                useRealLogs = true;
                
                // Parse the log file content
                const logLines = logContent.split('\n').filter(line => line.trim());
                
                // Get the last 50 lines
                const recentLines = logLines.slice(-50);
                
                logs = recentLines.map(line => {
                    try {
                        // Parse JSON log entry
                        const logData = JSON.parse(line);
                        return {
                            timestamp: logData.timestamp,
                            level: logData.level,
                            message: logData.message,
                            raw: line
                        };
                    } catch (e) {
                        // If not JSON, treat as plain text
                        return {
                            timestamp: new Date().toISOString(),
                            level: 'info',
                            message: line,
                            raw: line
                        };
                    }
                });
            }
        } catch (fileError) {
            console.log('Could not read log file:', fileError.message);
            
            // Fallback: Try to execute docker logs command from host
            try {
                const { stdout } = await execAsync('docker logs kyna-parser-queue --tail 50 --timestamps');
                if (stdout && stdout.trim()) {
                    console.log('Successfully fetched real logs from docker command');
                    useRealLogs = true;
                    
                    // Parse the real logs
                    const logLines = stdout.split('\n').filter(line => line.trim());
                    logs = logLines.map(line => {
                        // Extract timestamp and message from docker logs format
                        const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z)/);
                        const timestamp = timestampMatch ? timestampMatch[1] : new Date().toISOString();
                        
                        // Remove timestamp from the line to get the actual log message
                        const message = timestampMatch ? line.substring(timestampMatch[0].length + 1) : line;
                        
                        // Clean up ANSI color codes
                        const cleanMessage = message.replace(/\[32m|\[39m|\[0m|\[33m|\[31m/g, '');
                        
                        // Determine log level based on content
                        let level = 'info';
                        if (cleanMessage.includes('error') || cleanMessage.includes('❌')) {
                            level = 'error';
                        } else if (cleanMessage.includes('warn') || cleanMessage.includes('⚠️')) {
                            level = 'warn';
                        }
                        
                        return {
                            timestamp,
                            level,
                            message: cleanMessage,
                            raw: line
                        };
                    });
                }
            } catch (dockerError) {
                console.log('Could not fetch real logs from docker:', dockerError.message);
            }
        }
        
        // If we couldn't get real logs, return empty array
        if (!useRealLogs || logs.length === 0) {
            console.log('No real logs available');
            logs = [];
        }
        
        console.log('Returning', logs.length, 'logs (real:', useRealLogs, ')');
        
        res.json({
            success: true,
            logs: logs.reverse(), // Show newest first
            source: useRealLogs ? 'real' : 'sample'
        });
    } catch (error) {
        console.error('Error fetching parser logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch logs: ' + error.message
        });
    }
});

module.exports = router;
