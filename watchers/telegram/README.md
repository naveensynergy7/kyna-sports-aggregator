# Tele

A Telegram bot/client for monitoring groups and channels.

## Getting Started

### Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)
- Telegram API credentials from [my.telegram.org](https://my.telegram.org)

### Setup

1. **Get Telegram API credentials:**
   - Go to [my.telegram.org](https://my.telegram.org)
   - Login with your phone number
   - Go to "API development tools"
   - Create a new application and get your `api_id` and `api_hash`

2. **Update the code:**
   - Replace `apiId` and `apiHash` in `index.js` with your credentials

3. **Install dependencies:**
   ```bash
   npm install
   ```

### Running the Application

#### Step 1: Discover Available Groups
First, run the app to see all your groups and channels:

```bash
node index.js
```

This will:
- Ask for your phone number and verification code
- Show all your groups and channels with their usernames and IDs
- Save your session for future use

#### Step 2: Monitor a Specific Group
1. Copy the username or ID of the group you want to monitor
2. Edit `index.js` and uncomment the monitoring section (lines 61-87)
3. Replace `'GROUP_USERNAME_OR_ID'` with your target group's username or ID
4. Run again: `node index.js`

### Development

To add dependencies:

```bash
# For production dependencies
npm install <package-name>

# For development dependencies
npm install --save-dev <package-name>
```

### Scripts

- `npm test` - Run tests (currently not implemented)
- `npm start` - Start the application (you can add this script to package.json)

## Project Structure

```
tele/
├── index.js          # Main application file
├── package.json      # Project configuration and dependencies
├── .gitignore        # Git ignore rules
└── README.md         # This file
```

## License

ISC
