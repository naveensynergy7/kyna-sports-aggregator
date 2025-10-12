const express = require('express');
const Queue = require('bull');
const Redis = require('redis');
const OpenAI = require('openai');
const mysql = require('mysql2/promise');
const Joi = require('joi');
const winston = require('winston');
require('dotenv').config();

// Initialize Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Initialize Express app
const app = express();
const PORT = process.env.PARSER_QUEUE_PORT || 3002;

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));

// Initialize Redis client
const redisClient = Redis.createClient({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize MySQL connection pool
const dbPool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'kyna_admin',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Initialize Bull queue
const messageQueue = new Queue('message parsing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  }
});

// Validation schema for incoming messages
const messageSchema = Joi.object({
  message: Joi.string().min(1).max(10000).required(),
  platform: Joi.string().valid('telegram', 'whatsapp', 'facebook', 'discord', 'slack').required(),
  contactUrl: Joi.string().uri().optional()
});

// OpenAI prompt for extracting football match data
const FOOTBALL_EXTRACTION_PROMPT = `
You are a football match data extraction AI. Extract structured information from football-related messages.

Extract the following information if available:
- Entry (any amount or "free" - e.g., "$10", "free", "50 rupees", "no cost")
- Location/Venue (where the match will take place)
- Date (extract date in YYYY-MM-DD format)
- Time (extract time in HH:MM format, 24-hour format)
- Game Type (e.g., "5v5", "7v7", "11v11", "3v3", "pickup game")
- Contact URL (any contact information, phone numbers, social media links)

Return ONLY a valid JSON object with this structure:
{
  "entry": "string or null",
  "location": "string or null",
  "date": "YYYY-MM-DD string or null",
  "time": "HH:MM string or null",
  "gameType": "string or null",
  "contactUrl": "string or null",
  "confidence": "number between 0-1"
}

If no football-related information is found, return:
{
  "entry": null,
  "location": null,
  "date": null,
  "time": null,
  "gameType": null,
  "contactUrl": null,
  "confidence": 0
}

Message to analyze: `;

// Queue processor for parsing messages
messageQueue.process('parse-message', async (job) => {
  const { message, platform, contactUrl } = job.data;
  
  logger.info(`🔄 [Job ${job.id}] Starting to process message from ${platform}`);
  logger.info(`📝 [Job ${job.id}] Message: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`);
  
  try {
    logger.info(`🤖 [Job ${job.id}] Calling OpenAI API...`);
    
    // Call OpenAI API to extract football data
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a football match data extraction AI. Extract structured information from football-related messages and return only valid JSON."
        },
        {
          role: "user",
          content: FOOTBALL_EXTRACTION_PROMPT + message
        }
      ],
      temperature: 0.1,
      max_tokens: 1000
    });

    logger.info(`✅ [Job ${job.id}] OpenAI API response received`);
    
    const extractedData = JSON.parse(completion.choices[0].message.content);
    logger.info(`📊 [Job ${job.id}] Extracted data:`, { extractedData });
    
    // Save to database
    logger.info(`💾 [Job ${job.id}] Saving to database...`);
    await saveParsedMessage({
      originalMessage: message,
      platform,
      contactUrl,
      extractedData
    });

    logger.info(`🎉 [Job ${job.id}] Successfully processed and saved!`);
    return { success: true };

  } catch (error) {
    logger.error(`❌ [Job ${job.id}] Error occurred:`, { error: error.message, stack: error.stack });
    
    // Smart retry logic - only retry on API/network errors
    const isRetryableError = 
      error.message.includes('API') ||
      error.message.includes('network') ||
      error.message.includes('timeout') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('ENOTFOUND') ||
      error.code === 'ECONNRESET' ||
      error.code === 'ETIMEDOUT';

    if (isRetryableError) {
      logger.warn(`🔄 [Job ${job.id}] Retryable error - will retry`);
      throw error;
    } else {
      logger.info(`⏭️ [Job ${job.id}] Non-retryable error - skipping retry`);
      return { success: true, skipped: true, reason: error.message };
    }
  }
});

// Function to save parsed football match to database
async function saveParsedMessage(data) {
  const { originalMessage, platform, contactUrl, extractedData } = data;

  logger.info(`💾 Checking confidence level: ${extractedData.confidence}`);
  
  if (extractedData.confidence <= 0.3) {
    logger.info(`⏭️ Confidence too low (${extractedData.confidence}), skipping database save`);
    return;
  }

  logger.info(`✅ Confidence sufficient (${extractedData.confidence}), saving to database`);
  
  const connection = await dbPool.getConnection();
  
  try {
    logger.info(`🔗 Database connection acquired`);
    
    await connection.execute(`
      INSERT INTO football_matches (
        original_message, platform, entry, location, date, time, game_type, contact_url, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      originalMessage,
      platform,
      extractedData.entry,
      extractedData.location,
      extractedData.date,
      extractedData.time,
      extractedData.gameType,
      contactUrl || extractedData.contactUrl,
      extractedData.confidence
    ]);
    
    logger.info(`💾 Successfully saved to database`, {
      platform,
      confidence: extractedData.confidence,
      gameType: extractedData.gameType,
      location: extractedData.location
    });
    
  } catch (error) {
    logger.error(`❌ Database save failed:`, { error: error.message, stack: error.stack });
    throw error;
  } finally {
    connection.release();
    logger.info(`🔗 Database connection released`);
  }
}


// API Routes

// Add message to queue
app.post('/parse', async (req, res) => {
  try {
    logger.info(`📨 Received parse request from ${req.ip}`);
    
    // Validate input
    const { error, value } = messageSchema.validate(req.body);
    if (error) {
      logger.warn(`❌ Validation error:`, { error: error.details[0].message });
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    logger.info(`✅ Validation passed, adding to queue`, { 
      platform: value.platform,
      messageLength: value.message.length 
    });

    // Add job to queue
    const job = await messageQueue.add('parse-message', value, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50
    });

    logger.info(`🎯 Job added to queue`, { jobId: job.id });

    res.json({
      success: true,
      jobId: job.id
    });

  } catch (error) {
    logger.error(`❌ API error:`, { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  await messageQueue.close();
  await redisClient.quit();
  await dbPool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  await messageQueue.close();
  await redisClient.quit();
  await dbPool.end();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Parser Queue running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 API endpoint: http://localhost:${PORT}/parse`);
});

module.exports = app;
