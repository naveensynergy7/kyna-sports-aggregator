const express = require("express");
const Queue = require("bull");
const Redis = require("redis");
const OpenAI = require("openai");
const mysql = require("mysql2/promise");
const Joi = require("joi");
const winston = require("winston");
require("dotenv").config();

// Initialize Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
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
      ),
    }),
    new winston.transports.File({
      filename: "/app/logs/parser-queue.log",
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
    }),
  ],
});

// Initialize Express app
const app = express();
const PORT = process.env.PARSER_QUEUE_PORT || 3002;

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));

// Initialize Redis client
const redisClient = Redis.createClient({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
});

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize MySQL connection pool
const dbPool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "kyna_admin",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Initialize Bull queue
const messageQueue = new Queue("message parsing", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

// Validation schema for incoming messages
const messageSchema = Joi.object({
  message: Joi.string().min(1).max(10000).required(),
  platform: Joi.string()
    .valid("telegram", "whatsapp", "facebook", "discord", "slack")
    .required(),
  contactUrl: Joi.string().uri().optional(),
});

// OpenAI prompt for extracting football match data
const FOOTBALL_EXTRACTION_PROMPT = `
You are a football match data extraction AI. Extract structured information from football-related messages.

CRITICAL: Return ONLY the raw JSON object. Do NOT wrap it in markdown code blocks. Do NOT add any explanatory text before or after the JSON. Just the pure JSON object.

Extract the following information if available:

Entry – any amount or null (e.g., "$10") and if like 8.80-10 dollar each then return highest amount like $10.
Location/Venue – where the match will take place. CRITICAL LOCATION FORMATTING RULES (Singapore-specific):
1. Expand all abbreviations to full words:
   - "Sec" → "Secondary School"
   - "Pri" → "Primary School"
   - "St" → "Street" or "Saint" (use context)
   - "Ave" → "Avenue"
   - "Blvd" → "Boulevard"
   - "Rd" → "Road"
   - "Jln" → "Jalan"
   - "Lor" → "Lorong"
   - "Cres" → "Crescent"
   - "Dr" → "Drive"
   - Any other abbreviations should be expanded to their full form
2. Use proper capitalization (Title Case for proper nouns and place names in Singapore):
   - "North side" → "North Side"
   - "East coast" → "East Coast"
   - "West side" → "West Side"
   - "South side" → "South Side"
   - "Paya lebar" → "Paya Lebar"
   - "Eunos" → "Eunos" (already correct)
   - "Jurong" → "Jurong"
   - "Tampines" → "Tampines"
   - "Woodlands" → "Woodlands"
   - Capitalize all significant words in location names following Singapore naming conventions
3. Keep the full address/venue name as provided, but ensure abbreviations are expanded and capitalization follows Singapore standards.
Date – extract date in YYYY-MM-DD format (MySQL DATE format). CRITICAL DATE PARSING RULES:
1. For numeric dates (e.g., "09/11", "15/12"), ALWAYS interpret as DD/MM format (day/month), NOT MM/DD. This is the standard format in Singapore.
   - "09/11" = 9th November (NOT 11th September)
   - "15/12" = 15th December (NOT 12th January)
   - "28/11" = 28th November
2. The match date must be ON OR AFTER the "current date" given later in this prompt (Singapore). Never return a date before that day.
3. Pick the EARLIEST valid date that fits the message — do not jump an extra year "to be safe". Example: if current date is 5 April 2026 and the post implies 10 November, use 2026-11-10, NOT 2027-11-10.
4. Year rule: For month/day from the message, first try the current calendar year from context. Only if that full date would be BEFORE the current date, use the following year — never skip two years ahead unless the message explicitly names a year (e.g. "2028").
5. Do not invent far-future years. If the message has no year, the output year must be either the context current year or exactly one year after it — not +2, +3, etc.
6. Relative phrases ("tomorrow", "this Sunday", "next week"): compute the real calendar date from the given current date; do not default those to next calendar year.
Time – extract time in HH:MM:SS format, 24-hour format (MySQL TIME format)
Game Type – e.g., "5v5", "7v7", "11v11", "3v3", "pickup game". IMPORTANT: 
- Valid formats: "3v3", "5v5", "7v7", "11v11", "pickup game", or null if unclear
- 1v1 is NOTHING - it does not exist as a football game format. NEVER use "1v1" under any circumstances.
- If the number of players is unclear or not mentioned, return null instead of guessing
- Data extracted should be something similar as 5v5, 7v7, 11v11, 3v3. Do not use the full description.
Requirement (Looking For) – This field indicates what the post is looking for. It MUST be one of these categories: "Players", "Goalkeeper", "Opponent", "Referee", or "Pitch". IMPORTANT: "Players" is the DEFAULT for most cases. Use "Players" when the message is looking for players (e.g., "looking for players", "need players", "slot available", "need X more players"). Only use other categories when specifically mentioned: "Goalkeeper" (if specifically asking for a keeper/GK), "Opponent" (if looking for another team to play against), "Referee" (if looking for a referee), "Pitch" (if looking to rent/share a pitch). For football-related posts, this field should NEVER be null - default to "Players" if unclear.
Other Details – any additional information not captured in the above fields, e.g. equipment provided, special rules, etc.
Match Duration – the duration of the match in minutes. For example, if the message states 7-9pm, duration will be 120 minutes.
Match Pace – the pace of the game, if mentioned in the message. For example, "fast-paced", "competitive", "chill" etc.

Return ONLY this JSON structure (no markdown, no code blocks, no extra text):

{
"entry": "<extracted entry value or null>",
"location": "<extracted location or null>",
"date": "<extracted date in YYYY-MM-DD format or null>",
"time": "<extracted time in HH:MM:SS format or null>",
"gameType": "<extracted game type or null>",
"requirement": "<extracted requirement or null>",
"otherDetails": "<extracted other details or null>",
"confidence": <number between 0 and 1>,
"matchDuration": <number in minutes or null>,
"matchPace": "<extracted pace or null>"
}

If no football-related information is found, return ONLY:

{
"entry": null,
"location": null,
"date": null,
"time": null,
"gameType": null,
"requirement": null,
"otherDetails": null,
"confidence": 0,
"matchDuration": null,
"matchPace": null
}

Note: For football-related posts, requirement should always be set to one of: "Players", "Goalkeeper", "Opponent", "Referee", or "Pitch". Default to "Players" if not explicitly stated otherwise.

Additional instructions:

Always expand game type to a clear descriptive format if teams and number of players are mentioned. 1v1 is NOTHING - it does not exist. NEVER use "1v1" under any circumstances. If unsure about player count, return null instead of guessing.
If the relevant data cannot be parsed, default answer can be "DM to clarify".
For location (Singapore-specific): Expand all abbreviations (Sec → Secondary School, Pri → Primary School, Jln → Jalan, Lor → Lorong, etc.) and use proper capitalization following Singapore naming conventions (Title Case for place names: "North side" → "North Side", "Paya lebar" → "Paya Lebar", "East coast" → "East Coast").
Use 24-hour format for time in HH:MM:SS format (e.g., "13:00:00" for 1pm, "18:30:00" for 6:30pm).
Use YYYY-MM-DD format for date (e.g., "2025-10-27" for 27th October 2025).
For numeric dates, ALWAYS use DD/MM format: "09/11" = 9th November (NOT 11th September). If that month/day is already before the given current date in the current year, use the same month/day in the next year only — never add extra years. Prefer the nearest upcoming date, not the farthest.
Use requirement field to indicate what the post is looking for: "Players" (default), "Goalkeeper", "Opponent", "Referee", or "Pitch". For football-related posts, requirement should NEVER be null - always default to "Players" if the message doesn't explicitly state otherwise.
Use otherDetails for any extra info like match duration, equipment provided, special rules, etc.
Always provide a confidence score (0–1) indicating how sure you are that the extracted information is correct.
Use matchPace for the pace of the game, if mentioned in the message. For example, "fast-paced", "competitive", "chill" etc.

REMEMBER: Return ONLY the JSON object, nothing else. No markdown formatting, no code blocks, no explanations.

Message to analyze: `;

// Queue processor for parsing messages
messageQueue.process("parse-message", async (job) => {
  const { message, platform, contactUrl } = job.data;

  logger.info(
    `🔄 [Job ${job.id}] Starting to process message from ${platform}`
  );
  logger.info(
    `📝 [Job ${job.id}] Message: "${message.substring(0, 100)}${
      message.length > 100 ? "..." : ""
    }"`
  );

  try {
    // Singapore calendar date (avoid new Date(toLocaleString) + toISOString — wrong on many servers)
    const now = new Date();
    const currentDate = now.toLocaleDateString("en-CA", {
      timeZone: "Asia/Singapore",
    }); // YYYY-MM-DD
    const currentDay = now.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "Asia/Singapore",
    });
    const currentYear = Number(currentDate.slice(0, 4));

    // Build context-aware prompt
    const contextualPrompt = `${FOOTBALL_EXTRACTION_PROMPT}

IMPORTANT DATE CONTEXT:
- Current date: ${currentDate} (${currentDay})
- Current year: ${currentYear}
- Timezone: Singapore (SGT, UTC+8)

CRITICAL DATE PARSING RULES (Singapore, current date = ${currentDate}):
1. For numeric dates (e.g., "09/11", "28/11"), ALWAYS use DD/MM format (day/month), NOT MM/DD.
   - Example: "09/11" = 9th November, NOT 11th September
   - Example: "28/11" = 28th November
2. Output date must be >= ${currentDate}. Do NOT pick a year beyond ${currentYear + 1} unless the message explicitly states that later year.
3. Smallest-year rule: For month/day from the message, use year ${currentYear} if that gives a date >= ${currentDate}; otherwise use ${currentYear + 1}. Never use ${currentYear + 2} or later without an explicit year in the message.
4. "Tomorrow", "this Sunday", "next week": compute from ${currentDate} — do not shift to next calendar year unless the computed day is still before ${currentDate}.
5. If only a weekday is given (e.g. "Sunday"), use the next occurrence of that weekday on or after ${currentDate}.
6. ALWAYS return dates in YYYY-MM-DD format (MySQL DATE format).
7. ALWAYS return time in HH:MM:SS format (e.g., "13:00:00" for 1pm).
8. Do not output arbitrary far-future dates; stay as close to the message meaning as possible while keeping the date >= ${currentDate}.

Message to analyze: ${message}`;

    logger.info(`🤖 [Job ${job.id}] Calling OpenAI API...`);

    // Call OpenAI API to extract football data
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content:
            "You are a football match data extraction AI. Extract structured information from football-related messages and return only valid JSON. Use the provided current date in Asia/Singapore. Choose the nearest upcoming match date that fits the text — avoid extra future years unless the message clearly states them.",
        },
        {
          role: "user",
          content: contextualPrompt,
        },
      ],
      temperature: 0.1,
      max_tokens: 1000,
    });

    logger.info(`✅ [Job ${job.id}] OpenAI API response received`);

    const extractedData = JSON.parse(completion.choices[0].message.content);
    
    // If model returned a date before Singapore today, bump year (string YYYY-MM-DD, minimal bumps)
    if (extractedData.date && extractedData.confidence > 0) {
      const ymd = String(extractedData.date).trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(ymd) && ymd < currentDate) {
        let bumped = ymd;
        for (let i = 0; i < 4 && bumped < currentDate; i += 1) {
          const [y, m, d] = bumped.split("-").map(Number);
          bumped = `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        }
        logger.info(
          `🔄 [Job ${job.id}] Date ${extractedData.date} was before ${currentDate}, adjusted to ${bumped}`
        );
        extractedData.date = bumped;
      }
    }
    
    // Default requirement to "Players" if null/empty for football-related posts
    // Valid categories: "Players", "Goalkeeper", "Opponent", "Referee", "Pitch"
    if (extractedData.confidence > 0 && (!extractedData.requirement || extractedData.requirement === null || extractedData.requirement.trim() === "")) {
      extractedData.requirement = "Players";
      logger.info(`🔄 [Job ${job.id}] Defaulted requirement to "Players"`);
    }
    
    logger.info(`📊 [Job ${job.id}] Extracted data:`, { extractedData });

    // Save to database
    logger.info(`💾 [Job ${job.id}] Saving to database...`);
    await saveParsedMessage({
      originalMessage: message,
      platform,
      contactUrl,
      extractedData,
    });

    logger.info(`🎉 [Job ${job.id}] Successfully processed and saved!`);
    return { success: true };
  } catch (error) {
    logger.error(`❌ [Job ${job.id}] Error occurred:`, {
      error: error.message,
      stack: error.stack,
    });

    // Smart retry logic - only retry on API/network errors
    const isRetryableError =
      error.message.includes("API") ||
      error.message.includes("network") ||
      error.message.includes("timeout") ||
      error.message.includes("ECONNREFUSED") ||
      error.message.includes("ENOTFOUND") ||
      error.code === "ECONNRESET" ||
      error.code === "ETIMEDOUT";

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
    logger.info(
      `⏭️ Confidence too low (${extractedData.confidence}), skipping database save`
    );
    return;
  }

  logger.info(
    `✅ Confidence sufficient (${extractedData.confidence}), saving to database`
  );

  const connection = await dbPool.getConnection();

  try {
    logger.info(`🔗 Database connection acquired`);

    // Helper function to convert undefined to null
    const toNull = (value) =>
      value === undefined || value === "null" ? null : value;

    // Determine status based on required fields
    // If location, date, time, or game_type is missing → PENDING
    // If all are present → APPROVED
    const hasRequiredFields =
      extractedData.location &&
      extractedData.date &&
      extractedData.time &&
      extractedData.gameType;

    const status = hasRequiredFields ? "APPROVED" : "PENDING";

    logger.info(`📊 Match status: ${status}`, {
      location: !!extractedData.location,
      date: !!extractedData.date,
      time: !!extractedData.time,
      gameType: !!extractedData.gameType,
    });

    await connection.execute(
      `
      INSERT INTO football_matches (
        original_message, platform, entry, location, date, time, game_type, 
        requirement, other_details, contact_url, match_duration, match_pace, 
        status, confidence, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `,
      [
        originalMessage,
        platform,
        toNull(extractedData.entry),
        toNull(extractedData.location),
        toNull(extractedData.date),
        toNull(extractedData.time),
        toNull(extractedData.gameType),
        toNull(extractedData.requirement),
        toNull(extractedData.otherDetails),
        toNull(contactUrl || extractedData.contactUrl),
        toNull(extractedData.matchDuration),
        toNull(extractedData.matchPace),
        status,
        extractedData.confidence || 0,
      ]
    );

    logger.info(`💾 Successfully saved to database`, {
      platform,
      confidence: extractedData.confidence,
      gameType: extractedData.gameType,
      location: extractedData.location,
    });
  } catch (error) {
    logger.error(`❌ Database save failed:`, {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  } finally {
    connection.release();
    logger.info(`🔗 Database connection released`);
  }
}

// API Routes

// Add message to queue
app.post("/parse", async (req, res) => {
  try {
    logger.info(`📨 Received parse request from ${req.ip}`);

    // Validate input
    const { error, value } = messageSchema.validate(req.body);
    if (error) {
      logger.warn(`❌ Validation error:`, { error: error.details[0].message });
      return res.status(400).json({
        success: false,
        error: "Validation error",
        details: error.details[0].message,
      });
    }

    logger.info(`✅ Validation passed, adding to queue`, {
      platform: value.platform,
      messageLength: value.message.length,
    });

    // Add job to queue
    const job = await messageQueue.add("parse-message", value, {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
      removeOnComplete: 100,
      removeOnFail: 50,
    });

    logger.info(`🎯 Job added to queue`, { jobId: job.id });

    res.json({
      success: true,
      jobId: job.id,
    });
  } catch (error) {
    logger.error(`❌ API error:`, { error: error.message, stack: error.stack });
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  }
});

// API endpoint to delete expired matches (for cron jobs)
// Deletes matches that are within 2 hours of their start time (or have passed)
// Also deletes matches with only date (no time) if the date has passed
// Also removes duplicate matches based on original_message or (date + time + location)
app.get("/delete-expired-matches", async (req, res) => {
  try {
    let totalDeleted = 0;
    
    // 1. Delete expired matches
    // Use Singapore timezone (UTC+8) for date/time comparisons
    // Set session timezone to Singapore (UTC+8) for accurate comparisons
    await dbPool.execute("SET time_zone = '+08:00'");
    
    const expiredQuery = `
            DELETE FROM football_matches
            WHERE date IS NOT NULL 
            AND (
              -- Case 1: Has both date and time - delete if within 2 hours of start time
              -- NOW() now uses Singapore timezone (UTC+8)
              (time IS NOT NULL AND TIMESTAMP(date, time) <= DATE_ADD(NOW(), INTERVAL 2 HOUR))
              OR
              -- Case 2: Has only date (no time) - delete if date has passed in Singapore timezone
              (time IS NULL AND date < CURDATE())
            )
            `;
    const [expiredResult] = await dbPool.execute(expiredQuery);
    totalDeleted += expiredResult.affectedRows;
    logger.info(`🗑️ Deleted ${expiredResult.affectedRows} expired matches`);
    
    // 2. Delete duplicates based on date + time + location combination (priority 1)
    // If date, time, and location are all the same, delete duplicates
    const duplicateLocationQuery = `
            DELETE fm1 FROM football_matches fm1
            INNER JOIN football_matches fm2 
            WHERE fm1.id > fm2.id 
            AND fm1.date = fm2.date
            AND fm1.time = fm2.time
            AND fm1.location = fm2.location
            AND fm1.date IS NOT NULL
            AND fm1.time IS NOT NULL
            AND fm1.location IS NOT NULL
            AND fm2.date IS NOT NULL
            AND fm2.time IS NOT NULL
            AND fm2.location IS NOT NULL
            `;
    const [duplicateLocationResult] = await dbPool.execute(duplicateLocationQuery);
    totalDeleted += duplicateLocationResult.affectedRows;
    logger.info(`🗑️ Deleted ${duplicateLocationResult.affectedRows} duplicate matches (same date + time + location)`);
    
    // 3. Delete duplicates based on original_message (priority 2)
    // Only if date+time+location don't match, check if original message is the same
    const duplicateMessageQuery = `
            DELETE fm1 FROM football_matches fm1
            INNER JOIN football_matches fm2 
            WHERE fm1.id > fm2.id 
            AND fm1.original_message = fm2.original_message
            AND NOT (
                fm1.date = fm2.date 
                AND fm1.time = fm2.time 
                AND fm1.location = fm2.location
                AND fm1.date IS NOT NULL
                AND fm1.time IS NOT NULL
                AND fm1.location IS NOT NULL
                AND fm2.date IS NOT NULL
                AND fm2.time IS NOT NULL
                AND fm2.location IS NOT NULL
            )
            `;
    const [duplicateMessageResult] = await dbPool.execute(duplicateMessageQuery);
    totalDeleted += duplicateMessageResult.affectedRows;
    logger.info(`🗑️ Deleted ${duplicateMessageResult.affectedRows} duplicate matches (same original message, but different date/time/location)`);
    
    res.json({
      success: true,
      message: "Expired and duplicate matches deleted successfully",
      deleted: totalDeleted,
      breakdown: {
        expired: expiredResult.affectedRows,
        duplicateMessage: duplicateMessageResult.affectedRows,
        duplicateLocation: duplicateLocationResult.affectedRows
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error(`❌ Error deleting expired/duplicate matches:`, {
      error: error.message,
      stack: error.stack,
    });
    res.status(500).json({
      success: false,
      error: "Failed to delete expired/duplicate matches",
      message: error.message,
    });
  }
});


// Graceful shutdown
process.on("SIGTERM", async () => {
  await messageQueue.close();
  await redisClient.quit();
  await dbPool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await messageQueue.close();
  await redisClient.quit();
  await dbPool.end();
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Parser Queue running on port ${PORT}`);
  logger.info(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
  logger.info(`🔗 API endpoint: http://localhost:${PORT}/parse`);
});

module.exports = app;
