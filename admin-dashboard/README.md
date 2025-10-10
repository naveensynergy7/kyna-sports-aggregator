# Kyna Game Aggregator - Admin Dashboard

A Node.js admin dashboard with email/password authentication for managing sports game groups and Telegram integration.

## Features

- 🔐 Admin login with email/password
- 🛡️ Session management with expiry
- 🎨 Modern UI with Bootstrap and EJS templates
- 🗄️ MySQL database integration
- 📊 Dashboard with tabs for different sections
- 📱 Telegram OTP authentication
- 👥 Telegram group management
- 🔍 Real-time message monitoring

## Setup

### 1. Install Dependencies
```bash
cd admin-dashboard
npm install
```

### 2. Database Setup
```bash
# Create MySQL database
mysql -u root -p
CREATE DATABASE kyna_admin;

# Import schema
mysql -u root -p kyna_admin < database/admin-schema.sql
```

### 3. Environment Configuration
```bash
# Copy environment file
cp env.example .env

# Edit .env with your settings
nano .env
```

**Required Environment Variables:**
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` - Database configuration
- `SESSION_SECRET` - Secret key for sessions
- `TELEGRAM_API_ID` - Your Telegram API ID (from my.telegram.org)
- `TELEGRAM_API_HASH` - Your Telegram API Hash (from my.telegram.org)

### 4. Run Application
```bash
# Development
npm run dev

# Production
npm start
```

## Default Login

- **Email**: admin@kyna.com
- **Password**: admin123

## Database Schema

### admin_users
- id, email, password_hash, is_active, created_at, updated_at

### admin_sessions
- id, user_id, session_token, expires_at, created_at

### telegram_api_credentials
- id, user_id, api_id, api_hash, created_at, updated_at

### telegram_sessions
- id, user_id, phone_number, session_string, is_verified, expires_at, created_at, updated_at

### telegram_groups
- id, user_id, group_id, group_name, username, is_monitoring, created_at, updated_at

## API Endpoints

### Authentication
- `GET /` - Redirect to login or dashboard
- `GET /auth/login` - Login page
- `POST /auth/login` - Handle login
- `POST /auth/logout` - Logout

### Dashboard
- `GET /dashboard` - Dashboard with tabs (Overview, Groups, Messages, Analytics)
- `GET /telegram` - Telegram management page

### Telegram API
- `GET /api/telegram/api-credentials` - Get user's API credentials
- `POST /api/telegram/save-api-credentials` - Save user's API credentials
- `GET /api/telegram/session-status` - Check Telegram session status
- `POST /api/telegram/start-auth` - Start Telegram authentication process
- `POST /api/telegram/verify-otp` - Verify OTP and create session
- `GET /api/telegram/groups` - Get user's Telegram groups
- `POST /api/telegram/save-groups` - Save selected groups for monitoring
- `POST /api/telegram/disconnect` - Disconnect Telegram session

## Security Features

- Password hashing with bcrypt
- Session-based authentication
- Rate limiting
- Helmet security headers
- SQL injection protection

## Dashboard Features

- **Overview Tab**: Stats cards and quick actions
- **Groups Tab**: Placeholder for group management
- **Messages Tab**: Placeholder for message monitoring
- **Telegram Page**: 
  - Separate page accessible from sidebar
  - API credentials configuration
  - Phone number OTP authentication
  - Group selection and management
  - Real-time session status
  - Group monitoring toggle
- **Analytics Tab**: Placeholder for analytics and reporting

## Telegram Integration

### Getting Started
1. Get your Telegram API credentials from [my.telegram.org](https://my.telegram.org)
2. Login to the admin dashboard
3. Go to the Telegram page (from sidebar)
4. **First**: Enter your API ID and API Hash in the configuration section
5. **Then**: Enter your phone number and connect to Telegram
6. Complete Telegram's official authentication process
7. Select groups you want to monitor
8. Use your existing watcher with the database integration

### How It Works
- **Step 1**: Users enter their personal Telegram API credentials (API ID & Hash)
- **Step 2**: Users connect their Telegram accounts through Telegram's official authentication
- **Step 3**: Telegram handles OTP verification and session management
- **Step 4**: Users can select which groups/channels to monitor
- **Step 5**: Your existing watcher can use the database to get monitoring groups
- Messages are processed and can be sent to ChatGPT for parsing
- No messages are stored in the database (as requested)
- Sessions auto-expire and re-authentication is handled by Telegram
- Each user has their own API credentials and sessions

### Database Integration for Your Watcher
Use the `telegramDb.js` service in your existing watcher:

```javascript
const telegramDb = require('./admin-dashboard/database/telegramDb');

// Get all monitoring groups
const groups = await telegramDb.getMonitoringGroups();

// Get groups for specific user
const userGroups = await telegramDb.getUserMonitoringGroups(userId);

// Get user's session
const session = await telegramDb.getUserSession(userId);
```

## Next Steps

1. ✅ Telegram OTP authentication
2. ✅ Group selection and management
3. ✅ Database integration for existing watcher
4. Add ChatGPT integration for message parsing
5. Add WhatsApp integration
6. Add analytics and reporting
7. Implement admin user management
8. Add audit logging
