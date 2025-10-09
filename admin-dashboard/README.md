# Sports Game Aggregator - Admin Dashboard

A Node.js admin dashboard with email/password authentication for managing sports game groups.

## Features

- 🔐 Admin login with email/password
- 🛡️ Session management with expiry
- 🎨 Modern UI with Bootstrap and EJS templates
- 🗄️ MySQL database integration
- 📊 Dashboard with tabs for different sections

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
CREATE DATABASE sports_admin;

# Import schema
mysql -u root -p sports_admin < database/admin-schema.sql
```

### 3. Environment Configuration
```bash
# Copy environment file
cp env.example .env

# Edit .env with your settings
nano .env
```

### 4. Run Application
```bash
# Development
npm run dev

# Production
npm start
```

## Default Login

- **Email**: admin@sportsapp.com
- **Password**: admin123

## Database Schema

### admin_users
- id, email, password_hash, is_active, created_at, updated_at

### admin_sessions
- id, user_id, session_token, expires_at, created_at

## API Endpoints

- `GET /` - Redirect to login or dashboard
- `GET /auth/login` - Login page
- `POST /auth/login` - Handle login
- `POST /auth/logout` - Logout
- `GET /dashboard` - Dashboard with tabs (Overview, Groups, Messages, Analytics)

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
- **Analytics Tab**: Placeholder for analytics and reporting

## Next Steps

1. Add group management functionality
2. Implement message monitoring
3. Add analytics and reporting
4. Implement admin user management
5. Add audit logging
