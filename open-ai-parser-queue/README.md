# OpenAI Parser Queue

A microservice that processes messages from multiple platforms (Telegram, WhatsApp, Facebook, etc.) using OpenAI's API to extract structured sports event data.

## 🚀 Features

- **Multi-platform Support**: Handles messages from Telegram, WhatsApp, Facebook, Discord, Slack
- **AI-Powered Parsing**: Uses OpenAI GPT to extract structured sports data
- **Queue-based Processing**: Bull queue with Redis for reliable message processing
- **Database Storage**: MySQL storage for parsed messages and sports events
- **RESTful API**: Easy integration with other services
- **Health Monitoring**: Built-in health checks and monitoring
- **Error Handling**: Robust error handling with retry mechanisms
- **Batch Processing**: Support for processing multiple messages at once

## 📋 Extracted Data

The parser extracts the following information from sports-related messages:

- **Entry**: Any amount or "free" (e.g., "$10", "free", "50 rupees", "no cost")
- **Location**: Where the event will take place
- **Date**: Event date in YYYY-MM-DD format
- **Time**: Event time in HH:MM format (24-hour)
- **Game Type**: Format like "5v5", "7v7", "11v11", "3v3", "pickup game"
- **Contact URL**: Contact information, phone numbers, social media links
- **Confidence Score**: AI confidence in the extraction (0-1)

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Watchers      │───▶│  Parser Queue    │───▶│   Database      │
│ (Telegram, etc.)│    │  (This Service)  │    │   (MySQL)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │   OpenAI API     │
                       │   (GPT-3.5/4)    │
                       └──────────────────┘
```

## 🛠️ Installation

### Prerequisites

- Node.js 20+
- Redis server
- MySQL database
- OpenAI API key

### Setup

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Environment Configuration**:
   Create a `.env` file:
   ```bash
   # Database
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=your_password
   DB_NAME=kyna_admin

   # Redis
   REDIS_HOST=localhost
   REDIS_PORT=6379
   REDIS_PASSWORD=

   # OpenAI
   OPENAI_API_KEY=your_openai_api_key
   OPENAI_MODEL=gpt-3.5-turbo

   # Application
   PORT=3002
   NODE_ENV=development
   LOG_LEVEL=info
   ```

3. **Database Setup**:
   Run the database schema:
   ```bash
   mysql -u root -p kyna_admin < database/parser-schema.sql
   ```

4. **Start the service**:
   ```bash
   # Development
   npm run dev

   # Production
   npm start
   ```

## 📡 API Endpoints

### Health Check
```http
GET /health
```

### Parse Message
```http
POST /parse
Content-Type: application/json

{
  "platformName": "telegram",
  "message": "Football match this Saturday at 3 PM at Central Park. Need 8 more players!",
  "contactUrl": "https://t.me/john_doe",
  "groupId": "-1001234567890",
  "groupName": "Local Sports Group",
  "senderName": "John Doe",
  "timestamp": "2024-01-15T15:30:00Z",
  "metadata": {
    "messageId": "12345"
  }
}
```

### Queue Status
```http
GET /queue/status
```

### Recent Messages
```http
GET /messages/recent?limit=50&offset=0
```

### Sports Events
```http
GET /events?limit=50&offset=0&sport=football&minConfidence=0.5
```

## 🔧 Usage Examples

### Using the Client Library

```javascript
const ParserClient = require('./client/parser-client');

const parser = new ParserClient('http://localhost:3002');

// Parse a single message
const result = await parser.parseMessage({
  platformName: 'telegram',
  message: 'Basketball game tomorrow at 6 PM. Need 4 more players!',
  groupName: 'Sports Club',
  senderName: 'Mike'
});

console.log('Job ID:', result.jobId);

// Get sports events
const events = await parser.getSportsEvents({
  sport: 'basketball',
  minConfidence: 0.7
});

console.log('Found events:', events.events.length);
```

### Integration with Telegram Watcher

```javascript
// In your telegram watcher
const ParserClient = require('./open-ai-parser-queue/client/parser-client');

const parser = new ParserClient('http://parser-queue:3002');

// When a new message is received
async function handleNewMessage(messageData) {
  try {
    const result = await parser.parseMessage({
      platformName: 'telegram',
      message: messageData.text,
      groupId: messageData.groupId,
      groupName: messageData.groupName,
      senderName: messageData.senderName,
      timestamp: messageData.timestamp
    });
    
    console.log(`Message queued for parsing: ${result.jobId}`);
  } catch (error) {
    console.error('Failed to queue message:', error.message);
  }
}
```

## 🐳 Docker Deployment

### Docker Compose

Add to your `docker-compose.yml`:

```yaml
services:
  redis:
    image: redis:7-alpine
    container_name: kyna-redis
    ports:
      - "6379:6379"
    networks:
      - kyna-network

  parser-queue:
    build:
      context: ./open-ai-parser-queue
      dockerfile: Dockerfile
    container_name: kyna-parser-queue
    ports:
      - "3002:3002"
    environment:
      - DB_HOST=mysql
      - DB_PORT=3306
      - DB_USER=kyna_user
      - DB_PASSWORD=kyna_pass_123
      - DB_NAME=kyna_admin
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - NODE_ENV=production
    depends_on:
      - mysql
      - redis
    networks:
      - kyna-network
    restart: unless-stopped
```

### Environment Variables

```bash
# Required
OPENAI_API_KEY=your_openai_api_key

# Database
DB_HOST=mysql
DB_PORT=3306
DB_USER=kyna_user
DB_PASSWORD=kyna_pass_123
DB_NAME=kyna_admin

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# Application
PORT=3002
NODE_ENV=production
LOG_LEVEL=info
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3002/health
```

### Queue Status
```bash
curl http://localhost:3002/queue/status
```

### Logs
```bash
# Docker logs
docker logs kyna-parser-queue -f

# Application logs
tail -f logs/parser-queue.log
```

## 🔍 Database Schema

### Tables Created

1. **parsed_messages**: Stores all processed messages
2. **sports_events**: Stores extracted sports event data
3. **failed_jobs**: Stores failed processing attempts
4. **processing_stats**: Daily processing statistics
5. **api_usage_stats**: OpenAI API usage tracking

### Sample Queries

```sql
-- Get recent sports events
SELECT se.entry, se.location, se.date, se.time, se.game_type, se.contact_url, 
       pm.platform_name, pm.group_name, se.confidence
FROM sports_events se
JOIN parsed_messages pm ON se.message_id = pm.id
WHERE se.confidence > 0.7
ORDER BY se.created_at DESC
LIMIT 10;

-- Get events by game type
SELECT * FROM sports_events 
WHERE game_type = '5v5' 
AND date >= CURDATE()
ORDER BY date, time;

-- Get free events
SELECT * FROM sports_events 
WHERE entry = 'free' OR entry LIKE '%free%'
ORDER BY date, time;

-- Get processing statistics
SELECT platform_name, 
       SUM(total_messages) as total,
       SUM(sports_events_found) as events_found,
       AVG(avg_confidence) as avg_confidence
FROM processing_stats
WHERE date >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
GROUP BY platform_name;
```

## 🚨 Error Handling

The service includes comprehensive error handling:

- **Validation Errors**: Input validation with detailed error messages
- **API Errors**: OpenAI API error handling with retries
- **Database Errors**: Transaction rollback on failures
- **Queue Errors**: Failed job storage for manual review
- **Network Errors**: Connection retry logic

## 🔧 Configuration

### OpenAI Model Selection

```bash
# Use GPT-3.5 Turbo (faster, cheaper)
OPENAI_MODEL=gpt-3.5-turbo

# Use GPT-4 (more accurate, expensive)
OPENAI_MODEL=gpt-4
```

### Queue Configuration

```javascript
// In index.js, you can modify queue options:
const job = await messageQueue.add('parse-message', value, {
  attempts: 3,           // Retry failed jobs 3 times
  backoff: {
    type: 'exponential',
    delay: 2000,         // Start with 2 second delay
  },
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: 50       // Keep last 50 failed jobs
});
```

## 📈 Performance

### Optimization Tips

1. **Batch Processing**: Use `batchParse()` for multiple messages
2. **Confidence Filtering**: Set appropriate `minConfidence` thresholds
3. **Queue Monitoring**: Monitor queue length and processing times
4. **Database Indexing**: Ensure proper indexes on frequently queried columns
5. **Redis Memory**: Monitor Redis memory usage for queue storage

### Scaling

- **Horizontal Scaling**: Run multiple parser instances behind a load balancer
- **Queue Partitioning**: Use different queues for different platforms
- **Database Sharding**: Partition data by platform or date
- **Caching**: Cache frequently accessed data in Redis

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

[Your License Here]

## 🆘 Support

For issues or questions:
- Open an issue on GitHub
- Check the logs for error details
- Verify your OpenAI API key and quota
- Ensure Redis and MySQL are running
