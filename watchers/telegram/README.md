# Telegram Watcher

This watcher monitors Telegram groups for new messages and can process them (e.g., extract game details using AI).

## Features

- ✅ Automatically fetches API credentials from database
- ✅ Uses saved Telegram session (no OTP login needed)
- ✅ Monitors all groups marked for monitoring in the database
- ✅ Displays messages in real-time from monitored groups
- ✅ **Hot-Reload**: Update monitored groups without restarting
- ✅ **Control API**: Manage watcher via HTTP endpoints
- ✅ **Real-time Status**: Check watcher status from admin dashboard
- ✅ Graceful shutdown handling

## Prerequisites

1. **Database Setup**: Ensure the admin dashboard database is set up and running
2. **API Credentials**: Add your Telegram API ID and Hash via the admin dashboard
3. **Telegram Session**: Login via the admin dashboard to save your session
4. **Groups Selected**: Select groups to monitor in the admin dashboard

## Installation

```bash
cd watchers/telegram
npm install
```

## Configuration

The watcher reads configuration from the admin dashboard's `.env` file:

- `DB_HOST` - MySQL database host (default: localhost)
- `DB_USER` - MySQL database user (default: root)
- `DB_PASSWORD` - MySQL database password
- `DB_NAME` - Database name (default: kyna_admin)
- `WATCHER_CONTROL_PORT` - Control API port (default: 3001)

## Usage

```bash
npm start
```

Or:

```bash
node index.js
```

## How It Works

1. **Starts Control API**: Launches HTTP server for remote control (port 3001)
2. **Fetches Credentials**: Reads API ID and Hash from `telegram_api_credentials` table
3. **Loads Session**: Retrieves the saved session string from `telegram_sessions` table
4. **Gets Groups**: Fetches all groups where `is_monitoring = TRUE` from `telegram_groups` table
5. **Connects to Telegram**: Establishes connection using the saved session (no OTP needed)
6. **Monitors Messages**: Listens for new messages from the monitored groups
7. **Displays Messages**: Logs sender name and message text to console

## Control API Endpoints

The watcher exposes HTTP endpoints for remote management:

### GET `/status`
Returns the current status of the watcher:
```json
{
  "success": true,
  "isConnected": true,
  "monitoringCount": 3,
  "groups": [
    { "id": "1566178598", "name": "⚽️ FOOTBALL KAKIS @ SG ⚽️" }
  ]
}
```

### POST `/reload`
Reloads the list of monitored groups from the database without restarting:
```json
{
  "success": true,
  "count": 3,
  "groups": [...]
}
```

### POST `/restart`
Disconnects and reconnects to Telegram with fresh credentials and groups:
```json
{
  "success": true,
  "message": "Watcher restarted successfully"
}
```

## Admin Dashboard Integration

You can manage the watcher directly from the admin dashboard:

1. **View Status**: See if the watcher is online and how many groups it's monitoring
2. **Reload Groups**: Click "Reload Watcher" button to update monitored groups instantly
3. **Auto-Refresh**: Status updates automatically every 30 seconds

## Output Example

```
🔄 Fetching credentials from database...
🔄 Fetching groups to monitor...
📋 Found 2 group(s) to monitor:
   - Sports Group 1 (ID: 1566178598)
   - Game Alerts (ID: 1234567890)

🔄 Connecting to Telegram...
✅ Connected to Telegram successfully!
⏰ Waiting for messages...

📨 New message from: Sports Group 1
📍 Group ID: 1566178598
💬 Message: Basketball game tonight at 7 PM!
⏰ Time: 10/10/2025, 2:30:45 PM
────────────────────────────────────────────────────────────
```

## Next Steps

The watcher currently just displays messages. You can extend it to:

1. **Parse Messages**: Use ChatGPT/OpenAI to extract game details
2. **Store Data**: Save parsed game information to a database
3. **Send Notifications**: Alert users about new games
4. **Filter Messages**: Only process messages matching certain patterns

## Troubleshooting

### "No API credentials found in database"
- Login to the admin dashboard
- Go to Telegram section
- Add your API ID and Hash

### "No active Telegram session found in database"
- Login to the admin dashboard
- Go to Telegram section
- Complete the phone number + OTP verification

### "No groups to monitor"
- Login to the admin dashboard
- Go to Telegram section
- Select groups and save them

### Connection Issues
- Verify your database credentials in `.env`
- Ensure MySQL is running
- Check that the Telegram session hasn't expired (re-login in admin dashboard if needed)

## Stopping the Watcher

Press `Ctrl+C` to gracefully shut down the watcher.
