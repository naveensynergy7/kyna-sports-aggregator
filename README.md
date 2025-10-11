# Kyna Sports Aggregator

AI-powered platform that monitors social media groups (Telegram, WhatsApp, Facebook) to discover local sports matches and pickup games. Features intelligent message parsing, multi-platform monitoring, and a centralized dashboard for finding and joining games.

[![Docker](https://img.shields.io/badge/docker-ready-blue.svg)](https://www.docker.com/)
[![Node.js](https://img.shields.io/badge/node.js-20.x-green.svg)](https://nodejs.org/)
[![MySQL](https://img.shields.io/badge/mysql-8.0-blue.svg)](https://www.mysql.com/)

---

## 🚀 Quick Start (5 Minutes)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed
- [Git](https://git-scm.com/) installed
- **That's it!** No Node.js or MySQL installation needed!

### Setup Steps

```bash
# 1. Clone the repository
git clone <your-github-repo-url>
cd tele

# 2. Create environment file (defaults work out of the box!)
cp .env.example .env

# 3. Start everything with ONE command
docker-compose up -d

# 4. Wait ~30 seconds for services to initialize
# Check status:
docker-compose ps

# 5. Done! 🎉
```

### Access the Application

| Service | URL | Purpose |
|---------|-----|---------|
| **Admin Dashboard** | http://localhost:3000 | Manage Telegram groups & monitoring |
| **phpMyAdmin** | http://localhost:8080 | Database management UI |
| **Watcher API** | http://localhost:3001/status | Check watcher status |

**Default Login:**
- 📧 Email: `admin@kyna.one`
- 🔐 Password: `admin123`

⚠️ **Change the password immediately after first login!**

---

## 📦 What's Running?

| Service | Port | Description | Status Check |
|---------|------|-------------|--------------|
| **MySQL** | 3307 → 3306 | Database with persistent storage | `docker-compose logs mysql` |
| **phpMyAdmin** | 8080 → 80 | Web-based database manager | http://localhost:8080 |
| **Admin Dashboard** | 3000 | Web UI for Telegram management | http://localhost:3000 |
| **Telegram Watcher** | 3001 | Message monitoring service | http://localhost:3001/status |

---

## 🏗️ Project Structure

```
tele/
├── .env                          # Environment variables (create from .env.example)
├── .env.example                  # Environment template (commit to git)
├── .gitignore                    # Git ignore rules
├── docker-compose.yml            # Docker orchestration (all services)
├── README.md                     # This file
│
├── admin-dashboard/              # Web UI for Telegram management
│   ├── Dockerfile                # Docker image definition
│   ├── app.js                    # Express server entry point
│   ├── package.json              # Node.js dependencies
│   ├── routes/                   # API routes
│   │   ├── auth.js               # Authentication routes
│   │   ├── dashboard.js          # Dashboard routes
│   │   ├── telegram.js           # Telegram API routes
│   │   └── settings.js           # User settings routes
│   ├── views/                    # EJS templates
│   │   ├── layouts/main.ejs      # Main layout template
│   │   ├── auth/login.ejs        # Login page
│   │   ├── dashboard/index.ejs   # Dashboard page
│   │   ├── telegram/index.ejs    # Telegram management page
│   │   └── settings/index.ejs    # Settings page
│   ├── config/
│   │   └── database.js           # Database connection config
│   ├── middleware/
│   │   └── auth.js               # Authentication middleware
│   └── database/
│       ├── admin-schema.sql      # Database initialization SQL
│       └── telegramDb.js         # Database utilities
│
└── watchers/
    └── telegram/                 # Telegram message watcher
        ├── Dockerfile            # Docker image definition
        ├── index.js              # Watcher main file
        ├── package.json          # Node.js dependencies
        └── nodemon.json          # Nodemon configuration
```

---

## 🛠️ Development Workflow

### Making Code Changes

**Hot-reload is enabled!** Just edit your code and save:
- ✅ Admin Dashboard → Auto-reload via nodemon
- ✅ Watcher → Auto-reload via nodemon
- ✅ No need to restart containers!

Example:
```bash
# 1. Edit a file
vim admin-dashboard/app.js

# 2. Save it
# 3. Check logs to see it restarted
docker-compose logs -f admin-dashboard
```

### View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f admin-dashboard
docker-compose logs -f watcher
docker-compose logs -f mysql

# Last 50 lines
docker-compose logs --tail 50 admin-dashboard
```

### Restart Services

```bash
# Restart specific service
docker-compose restart admin-dashboard
docker-compose restart watcher

# Restart all services
docker-compose restart

# Stop all services (data persists)
docker-compose down

# Start all services
docker-compose up -d
```

### Install New Dependencies

```bash
# Option 1: Add to package.json and rebuild
vim admin-dashboard/package.json  # Add dependency
docker-compose build admin-dashboard
docker-compose up -d admin-dashboard

# Option 2: Install inside running container
docker-compose exec admin-dashboard npm install <package-name>
docker-compose restart admin-dashboard
```

### Database Operations

```bash
# Access MySQL CLI
docker exec -it kyna-mysql mysql -u kyna_user -pkyna_pass_123 kyna_admin

# Backup database
docker exec kyna-mysql mysqldump -u kyna_user -pkyna_pass_123 kyna_admin > backup.sql

# Restore database
docker exec -i kyna-mysql mysql -u kyna_user -pkyna_pass_123 kyna_admin < backup.sql

# View tables
docker exec -it kyna-mysql mysql -u kyna_user -pkyna_pass_123 kyna_admin -e "SHOW TABLES;"

# Or use phpMyAdmin: http://localhost:8080
```

---

## 🔧 Common Commands

### Docker Commands

```bash
# View running containers
docker ps

# View all containers (including stopped)
docker ps -a

# Check Docker disk usage
docker system df

# Clean up unused images/containers/volumes
docker system prune

# Clean up everything (CAUTION!)
docker system prune -a --volumes
```

### Application Commands

```bash
# Enter container shell
docker-compose exec admin-dashboard sh
docker-compose exec watcher sh

# Run npm commands inside container
docker-compose exec admin-dashboard npm run <script>

# Check environment variables
docker-compose exec admin-dashboard env | grep DB_

# Test watcher status
curl http://localhost:3001/status
```

---

## 🐛 Troubleshooting

### Problem: "Port already in use"

```bash
# Check what's using the port
lsof -i :3000  # or :3001, :3307, :8080

# Kill the process
kill -9 <PID>

# Or change port in docker-compose.yml
```

### Problem: "Cannot connect to MySQL"

```bash
# Check if MySQL is healthy
docker-compose ps

# View MySQL logs
docker-compose logs mysql

# Restart MySQL
docker-compose restart mysql

# Wait for health check
docker-compose logs mysql | grep "ready for connections"
```

### Problem: "Module not found" or dependency issues

```bash
# Rebuild the container
docker-compose build admin-dashboard
docker-compose up -d admin-dashboard

# Or clear everything and start fresh
docker-compose down
docker-compose up -d --build
```

### Problem: "Changes not reflecting"

```bash
# Check if nodemon is running
docker-compose logs admin-dashboard | grep nodemon

# Force restart
docker-compose restart admin-dashboard

# Check logs
docker-compose logs -f admin-dashboard
```

### Problem: "Watcher showing offline"

```bash
# Check watcher status
curl http://localhost:3001/status

# Check watcher logs
docker-compose logs watcher

# Restart watcher
docker-compose restart watcher

# Or reload from admin panel: Click "Reload Watcher" button
```

### Problem: "Out of disk space"

```bash
# Check Docker disk usage
docker system df

# Remove unused images
docker image prune -a

# Remove unused volumes (CAUTION: Deletes data!)
docker volume prune

# Clean everything
docker system prune -a --volumes
```

---

## 🔐 Environment Variables

Edit `.env` file to configure:

```bash
# Database Configuration (Docker MySQL)
DB_HOST=mysql              # Use 'mysql' for Docker, 'localhost' for local
DB_PORT=3306               # Internal port (3307 is external/host port)
DB_USER=kyna_user          # Database username
DB_PASSWORD=kyna_pass_123  # Database password
DB_NAME=kyna_admin         # Database name

# Admin Dashboard
PORT=3000                  # Admin dashboard port
SESSION_SECRET=<change-in-production>  # Session encryption key

# Telegram Watcher
WATCHER_CONTROL_PORT=3001  # Watcher API port
WATCHER_URL=http://watcher:3001  # URL for admin to reach watcher

# Environment
NODE_ENV=development       # development or production
```

### Important Notes:

⚠️ **For Docker:**
- Use `DB_HOST=mysql` (service name)
- Use `DB_PORT=3306` (internal port)
- Use `WATCHER_URL=http://watcher:3001`

⚠️ **For Local (non-Docker):**
- Use `DB_HOST=localhost`
- Use `DB_PORT=3307` (external mapped port)
- Use `WATCHER_URL=http://localhost:3001`

---

## 📚 Tech Stack

### Backend
- **Node.js** 20.x LTS - JavaScript runtime
- **Express.js** - Web framework
- **MySQL 8.0** - Relational database
- **gramJS** - Telegram client library
- **bcryptjs** - Password hashing
- **express-session** - Session management

### Frontend
- **EJS** - Templating engine
- **Bootstrap 5** - UI framework
- **SweetAlert2** - Toast notifications

### DevOps
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration
- **Nodemon** - Hot-reload for development
- **phpMyAdmin** - Database management UI

---

## 🚀 Deployment (Production)

### Pre-deployment Checklist

- [ ] Change `SESSION_SECRET` in `.env` to a strong random string
- [ ] Change MySQL passwords (`MYSQL_ROOT_PASSWORD`, `MYSQL_PASSWORD`)
- [ ] Change default admin password (`admin123`)
- [ ] Set `NODE_ENV=production`
- [ ] Enable HTTPS/SSL certificates
- [ ] Configure firewall rules
- [ ] Set up backup strategy for database
- [ ] Configure monitoring and alerts
- [ ] Review security headers in `admin-dashboard/app.js`

### Production Deployment

```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Start in production mode
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps
```

### Recommended Production Setup

1. **Reverse Proxy**: Use Nginx/Caddy for SSL termination
2. **Secrets Management**: Use Docker secrets or environment files
3. **Monitoring**: Add Prometheus + Grafana
4. **Backups**: Automated daily database backups
5. **Logging**: Centralized logging with ELK stack
6. **CI/CD**: GitHub Actions for automated deployments

---

## 👥 Team Collaboration

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "Add: your feature description"

# Push to remote
git push origin feature/your-feature-name

# Create Pull Request on GitHub
```

### What to Commit

✅ **DO commit:**
- Source code (`.js`, `.ejs`, `.html`, `.css`)
- `docker-compose.yml`, `Dockerfile`
- `.env.example` (template)
- `package.json`, `package-lock.json`
- `.gitignore`
- Database schema (`admin-schema.sql`)
- Documentation (`README.md`)

❌ **DON'T commit:**
- `.env` (contains secrets!)
- `node_modules/` (too large)
- `*.log` files
- `.DS_Store`, `.vscode/` (personal files)
- Database backups (`.sql` dumps)

---

## 🧪 Testing

```bash
# Run all containers
docker-compose up -d

# Check all services are healthy
docker-compose ps

# Test admin dashboard
curl http://localhost:3000

# Test watcher API
curl http://localhost:3001/status

# Test database connection
docker exec -it kyna-mysql mysql -u kyna_user -pkyna_pass_123 kyna_admin -e "SELECT 1;"
```

---

## 📖 Additional Documentation

- [Docker Compose Docs](https://docs.docker.com/compose/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [gramJS Documentation](https://gram.js.org/)
- [MySQL 8.0 Reference](https://dev.mysql.com/doc/refman/8.0/en/)

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📝 License

[Your License Here]

---

## 💬 Support

For issues or questions:
- Open an issue on GitHub
- Contact: [Your Contact Info]
- Documentation: [Your Docs URL]

---

## 🎯 Roadmap

- [x] Telegram integration
- [x] Admin dashboard
- [x] Docker setup
- [x] Message monitoring
- [ ] WhatsApp integration
- [ ] Facebook integration
- [ ] AI message parsing
- [ ] Mobile app
- [ ] Public web app for discovering games

---

**Made with ❤️ for the sports community**

**Happy Coding! 🎉**

