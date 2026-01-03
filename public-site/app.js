const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = express();
const PORT = process.env.PUBLIC_SITE_PORT || 3001;

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));
app.use("/public", express.static(path.join(__dirname, "public")));

// MySQL connection pool
const dbPool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "kyna_admin",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Cache for train service status (5 minute TTL)
let trainServiceCache = {
  data: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes
};

// Cache for MRT lines data (5 minute TTL)
let mrtLinesCache = {
  data: null,
  timestamp: 0,
  ttl: 5 * 60 * 1000 // 5 minutes
};

const LTA_BASE_URL = 'https://www.lta.gov.sg';
const DATAMALL_API_URL = 'https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts';
const STATUS_IMAGE_BASE = 'https://www.lta.gov.sg/content/dam/ltagov/map/mrt/TrainDisruption/';

// Helper function to fetch and process train service status
async function getTrainServiceStatus() {
  // Check cache first
  const now = Date.now();
  if (trainServiceCache.data && (now - trainServiceCache.timestamp) < trainServiceCache.ttl) {
    console.log("🚇 Using cached train service status");
    return trainServiceCache.data;
  }

  try {
    const LTA_API_KEY = process.env.LTA_API_KEY || "wKPPIctaRkmGmszaXrTlUw==";
    const apiUrl = "https://datamall2.mytransport.sg/ltaodataservice/TrainServiceAlerts";
    
    console.log("🚇 Fetching train service status from DataMall API...");
    console.log("📍 API URL:", apiUrl);
    console.log("🔑 Using API Key:", LTA_API_KEY.substring(0, 10) + "...");
    
    // Create an AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    try {
      const response = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "AccountKey": LTA_API_KEY,
          "Accept": "application/json"
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      console.log("📡 Response status:", response.status, response.statusText);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log("❌ Error response body:", errorText);
        throw new Error(`DataMall API failed: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log("📦 Raw API Response:", JSON.stringify(data, null, 2));
      
      // Train line mapping
      const trainLineMapping = {
        EW: "East-West Line",
        NS: "North-South Line",
        NE: "North East Line",
        CC: "Circle Line",
        DT: "Downtown Line",
        TE: "Thomson-East Coast Line"
      };
      
      // Initialize all lines to "Normal service"
      const lineStatuses = {};
      Object.keys(trainLineMapping).forEach(lineCode => {
        lineStatuses[lineCode] = "Normal service";
      });
      
      // Process API response
      // API returns: { value: { Status: 1, AffectedSegments: [], Message: [{ Content: "...", CreatedDate: "..." }] } }
      // Status: 1 = Alert exists, 0 or undefined = Normal service
      if (data.value && typeof data.value === 'object') {
        const alertData = data.value;
        const status = alertData.Status;
        
        console.log("📊 Alert Status:", status);
        
        // Only process if there's an active alert (Status === 1)
        if (status === 1 && alertData.Message && Array.isArray(alertData.Message) && alertData.Message.length > 0) {
          console.log("⚠️  Processing active alert with", alertData.Message.length, "message(s)");
          
          // Combine all messages into a general message
          const messages = alertData.Message.map(messageObj => {
            return messageObj.Content || messageObj.content || "";
          }).filter(msg => msg.length > 0);
          
          if (messages.length > 0) {
            // Join all messages with a separator, or use the first one
            let generalMessage = messages.join(" | ");
            
            // Show full message without clipping
            console.log("📝 General message:", generalMessage);
            
            // Apply the same general message to all lines
            Object.keys(trainLineMapping).forEach(lineCode => {
              lineStatuses[lineCode] = generalMessage;
            });
          }
        } else {
          console.log("✅ No active alerts - all services normal");
        }
      } else {
        console.log("⚠️  Unexpected API response format");
      }
      
      // Return a single general message instead of per-line statuses
      const generalMessage = lineStatuses.EW !== "Normal service" ? lineStatuses.EW : "Normal service";
      
      console.log("✅ General train service message:", generalMessage);
      const result = {
        message: generalMessage,
        hasAlert: generalMessage !== "Normal service"
      };
      
      // Cache the result
      trainServiceCache.data = result;
      trainServiceCache.timestamp = now;
      
      return result;
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        console.error("❌ Train service API timed out after 5 seconds");
      } else {
        console.error("❌ Error fetching train service status:", fetchError);
      }
      
      // If we have cached data, return it even if expired
      if (trainServiceCache.data) {
        console.log("⚠️  Using stale cache due to API failure");
        return trainServiceCache.data;
      }
      
      // Return default statuses on error
      return {
        message: "Normal service",
        hasAlert: false
      };
    }
  } catch (error) {
    console.error("❌ Error in getTrainServiceStatus:", error);
    
    // If we have cached data, return it even if expired
    if (trainServiceCache.data) {
      console.log("⚠️  Using stale cache due to error");
      return trainServiceCache.data;
    }
    
    // Return default statuses on error
    return {
      message: "Normal service",
      hasAlert: false
    };
  }
}

// Helper function to fetch Train Service Alerts
async function getTrainServiceAlerts() {
  try {
    const LTA_API_KEY = process.env.LTA_API_KEY || "wKPPIctaRkmGmszaXrTlUw==";
    const response = await axios.get(DATAMALL_API_URL, {
      headers: {
        'AccountKey': LTA_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    if (response.data && response.data.value) {
      return response.data.value;
    }
    return response.data;
  } catch (error) {
    console.error("❌ Error fetching train alerts:", error.message);
    // Return default structure with no alerts
    return {
      Status: 1,
      AffectedSegments: [],
      Message: []
    };
  }
}

// Helper function to parse alerts and map to line status and messages
function parseAlertsToStatusMap(alerts) {
  const statusMap = {};
  const msgMap = {};
  const knownLines = ['EW', 'STL', 'BPL', 'NSL', 'DTL', 'PTL', 'NEL', 'CCL', 'TEL', 'EWL', 'NS', 'NE', 'CC', 'DT', 'BP', 'STC', 'PTC'];
  
  // Initialize all lines to Normal explicitly
  knownLines.forEach(id => {
    statusMap[id] = 'Normal';
  });
  
  if (!alerts || !alerts.Message || !Array.isArray(alerts.Message)) {
    return { statusMap, msgMap };
  }
  
  // Parse messages - format: "HH:MM-<LINE>-Major" or "HH:MM-<LINE>-Minor" or "HH:MM-<LINE>-Planned"
  alerts.Message.forEach((entry) => {
    const raw = (entry.Content || entry.content || '').toString().replace(/\r\n/g, '\n').trim();
    const match = raw.match(/^(\d{2}:\d{2})-([A-Za-z0-9]+)-(Major|Minor|Planned)\b\.?\s*([\s\S]*)$/i);
    
    if (!match) {
      return; // Ignore messages that don't match the pattern
    }
    
    const time = match[1];
    const line = (match[2] || '').toUpperCase();
    const rawKey = (match[3] || '').toLowerCase();
    const remainder = (match[4] || '').trim();
    const createdRaw = entry.CreatedDate || entry.createdDate || entry.Created_Date || entry.created_date || '';
    
    // Normalize status key
    const statusKey = rawKey === 'major' ? 'major' : rawKey === 'minor' ? 'minor' : rawKey === 'planned' ? 'planned' : null;
    const statusFull = statusKey === 'major' ? 'Major' : statusKey === 'minor' ? 'Minor' : statusKey === 'planned' ? 'Planned' : '';
    const boldPrefix = time + '-' + line + '-' + statusFull;
    
    // Parse timestamp
    let createdTs = Date.now();
    if (createdRaw && typeof createdRaw === 'string') {
      try {
        const normalized = createdRaw.trim().replace(/\s+/, 'T');
        createdTs = Date.parse(normalized) || Date.now();
      } catch (e) {
        createdTs = Date.now();
      }
    }
    if (!createdTs || isNaN(createdTs)) {
      createdTs = Date.now();
    }
    
    // Keep only the latest message per line
    const existing = msgMap[line];
    if (!existing || !existing._createdTs || createdTs >= existing._createdTs) {
      msgMap[line] = {
        statusKey: statusKey,
        originalKey: rawKey,
        status: statusFull,
        msg: remainder || statusFull,
        full: raw,
        boldPrefix: boldPrefix,
        _createdTs: createdTs
      };
    }
  });
  
  // Map status keys to icon statuses (strict: Major -> Moderate, Minor -> Minor, Planned -> Planned)
  Object.keys(msgMap).forEach(line => {
    const statusKey = msgMap[line].statusKey.toLowerCase();
    if (statusKey === 'major') {
      statusMap[line] = 'Moderate';
    } else if (statusKey === 'minor') {
      statusMap[line] = 'Minor';
    } else if (statusKey === 'planned') {
      statusMap[line] = 'Planned';
    }
  });
  
  return { statusMap, msgMap };
}

// Helper function to parse line list HTML and extract line data
async function parseLineListHTML(html, statusMap = {}, msgMap = {}) {
  const $ = cheerio.load(html);
  const lines = [];
  
  $('ul.trains li').each(function() {
    const $li = $(this);
    const $link = $li.find('a');
    const lineId = $link.attr('data-id');
    const $img = $link.find('img.mrtline-icon');
    const iconSrc = $img.attr('src') || '';
    
    // Extract line name - get text but exclude image alt text
    let lineName = '';
    $link.contents().each(function() {
      if (this.nodeType === 3) { // Text node
        lineName += $(this).text();
      }
    });
    lineName = lineName.trim().replace(/\s+/g, ' ');
    
    if (lineId) {
      // Use absolute URL for icon
      let iconUrl = iconSrc;
      if (iconSrc && !iconSrc.startsWith('http')) {
        if (iconSrc.startsWith('/')) {
          iconUrl = `${LTA_BASE_URL}${iconSrc}`;
        } else {
          iconUrl = `${LTA_BASE_URL}/${iconSrc}`;
        }
      }
      
      // Get status for this line (normalize ID variations)
      const normalizedId = lineId.toUpperCase();
      const status = statusMap[normalizedId] || statusMap[lineId] || 'Normal';
      const statusIcon = `${STATUS_IMAGE_BASE}${status}.png`;
      
      // Get message for this line (for UI display)
      const message = msgMap[normalizedId] || msgMap[lineId] || null;
      
      lines.push({
        id: lineId,
        name: lineName,
        icon: iconUrl,
        status: status,
        statusIcon: statusIcon,
        message: message
      });
    }
  });
  
  return lines;
}

// Helper function to format last updated timestamp
function formatLastUpdated() {
  const now = new Date();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = now.getDate().toString().padStart(2, '0');
  const month = months[now.getMonth()];
  const year = now.getFullYear();
  let hours = now.getHours();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const minutes = now.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year} ${hours}:${minutes} ${ampm}`;
}

// Helper function to get MRT lines with status
async function getMRTLines() {
  // Check cache first
  const now = Date.now();
  if (mrtLinesCache.data && (now - mrtLinesCache.timestamp) < mrtLinesCache.ttl) {
    console.log("🚇 Using cached MRT lines data");
    return mrtLinesCache.data;
  }

  try {
    // Fetch line list HTML and alerts in parallel
    const [lineListResponse, alerts] = await Promise.all([
      axios.get(`${LTA_BASE_URL}/map/mrt/line_list.html`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      }),
      getTrainServiceAlerts()
    ]);
    
    // Parse alerts to status map and message map
    const { statusMap, msgMap } = parseAlertsToStatusMap(alerts);
    
    // Parse HTML and add status icons and messages
    const lines = await parseLineListHTML(lineListResponse.data, statusMap, msgMap);
    const lastUpdated = formatLastUpdated();
    
    const result = {
      lines: lines,
      lastUpdated: lastUpdated
    };
    
    // Cache the result
    mrtLinesCache.data = result;
    mrtLinesCache.timestamp = now;
    
    return result;
  } catch (error) {
    console.error('❌ Error fetching MRT lines:', error.message);
    
    // If we have cached data, return it even if expired
    if (mrtLinesCache.data) {
      console.log("⚠️  Using stale cache due to error");
      return mrtLinesCache.data;
    }
    
    // Fallback data with default Normal status
    const fallbackLines = [
      { id: 'EWL', name: 'East-West Line', icon: `${LTA_BASE_URL}/content/dam/ltagov/img/map/mrt/Icon_EastWestLine.svg`, status: 'Normal', statusIcon: `${STATUS_IMAGE_BASE}Normal.png`, message: null },
      { id: 'NSL', name: 'North-South Line', icon: `${LTA_BASE_URL}/content/dam/ltagov/img/map/mrt/Icon_NorthSouthLine.svg`, status: 'Normal', statusIcon: `${STATUS_IMAGE_BASE}Normal.png`, message: null },
      { id: 'NEL', name: 'North East Line', icon: `${LTA_BASE_URL}/content/dam/ltagov/img/map/mrt/Icon_NorthEastLine.svg`, status: 'Normal', statusIcon: `${STATUS_IMAGE_BASE}Normal.png`, message: null },
      { id: 'CCL', name: 'Circle Line', icon: `${LTA_BASE_URL}/content/dam/ltagov/img/map/mrt/Icon_CircleLine.svg`, status: 'Normal', statusIcon: `${STATUS_IMAGE_BASE}Normal.png`, message: null },
      { id: 'DTL', name: 'Downtown Line', icon: `${LTA_BASE_URL}/content/dam/ltagov/img/map/mrt/Icon_Downtown_Line.svg`, status: 'Normal', statusIcon: `${STATUS_IMAGE_BASE}Normal.png`, message: null },
      { id: 'TEL', name: 'Thomson-East Coast Line', icon: `${LTA_BASE_URL}/content/dam/ltagov/img/map/mrt/Icon_Thomson_East_Coast_Line.svg`, status: 'Normal', statusIcon: `${STATUS_IMAGE_BASE}Normal.png`, message: null },
      { id: 'BPL', name: 'Bukit Panjang LRT', icon: `${LTA_BASE_URL}/content/dam/ltagov/img/map/mrt/Icon_Bukit_Panjang_LRT.svg`, status: 'Normal', statusIcon: `${STATUS_IMAGE_BASE}Normal.png`, message: null },
      { id: 'STL', name: 'Sengkang LRT', icon: `${LTA_BASE_URL}/content/dam/ltagov/img/map/mrt/Icon_Sengkang_LRT.svg`, status: 'Normal', statusIcon: `${STATUS_IMAGE_BASE}Normal.png`, message: null },
      { id: 'PTL', name: 'Punggol LRT', icon: `${LTA_BASE_URL}/content/dam/ltagov/img/map/mrt/Icon_Punggol_LRT.svg`, status: 'Normal', statusIcon: `${STATUS_IMAGE_BASE}Normal.png`, message: null }
    ];
    
    return {
      lines: fallbackLines,
      lastUpdated: formatLastUpdated(),
      error: 'Using fallback data. Unable to fetch from LTA website.'
    };
  }
}

// Games route - KYNA Exceptional Jerseys page (now homepage)
app.get("/", async (req, res) => {
  try {
    const trainService = await getTrainServiceStatus();
    const mrtLines = await getMRTLines();
    res.render("games", { trainService, mrtLines });
  } catch (error) {
    console.error("Error in / route:", error);
    // Render with default message on error
    res.render("games", {
      trainService: {
        message: "Normal service",
        hasAlert: false
      },
      mrtLines: {
        lines: [],
        lastUpdated: new Date().toLocaleString(),
        error: "Unable to fetch MRT lines data"
      }
    });
  }
});

// Home route - show matches with filters (moved to /games)
app.get("/games", async (req, res) => {
  try {
    // Get filter parameters
    const filters = {
      date: req.query.date || "",
      enddate: req.query.enddate || "",
      time: req.query.time || "",
      endtime: req.query.endtime || "",
      day: req.query.day || "",
      gameType: req.query.gameType || "",
      requirement: req.query.requirement || "",
      sorting: req.query.sorting || "",
      status: "APPROVED",
    };

    // Get unique values for filter dropdowns (only from APPROVED matches)
    const [dates] = await dbPool.query(
      'SELECT DISTINCT date FROM football_matches WHERE date IS NOT NULL AND status = "APPROVED" ORDER BY date DESC LIMIT 50'
    );
    const [times] = await dbPool.query(
      'SELECT DISTINCT time FROM football_matches WHERE time IS NOT NULL AND status = "APPROVED" ORDER BY time LIMIT 50'
    );
    // Only show specific game types: 5v5, 6v6, 7v7, 8v8, 9v9, 11v11
    const allowedGameTypes = ['5v5', '6v6', '7v7', '8v8', '9v9', '11v11'];
    const [gameTypes] = await dbPool.query(
      `SELECT DISTINCT game_type FROM football_matches 
       WHERE game_type IS NOT NULL 
       AND status = "APPROVED" 
       AND game_type IN (?)
       ORDER BY FIELD(game_type, '5v5', '6v6', '7v7', '8v8', '9v9', '11v11')`
      , [allowedGameTypes]
    );
    // Get unique requirement values (Looking For) from database
    const [requirements] = await dbPool.query(
      'SELECT DISTINCT requirement FROM football_matches WHERE requirement IS NOT NULL AND status = "APPROVED" ORDER BY requirement'
    );

    // Format dates to YYYY-MM-DD
    const formattedDates = dates.map((d) => {
      const date = new Date(d.date);
      return date.toISOString().split("T")[0];
    });

    // Filter game types to only include allowed values
    const filteredGameTypes = gameTypes
      .map((g) => g.game_type)
      .filter((gt) => allowedGameTypes.includes(gt));

    // Fetch MRT lines data
    const mrtLines = await getMRTLines();

    res.render("index", {
      filters: filters,
      availableDates: formattedDates,
      availableTimes: times.map((t) => t.time),
      availableGameTypes: filteredGameTypes,
      availableRequirements: requirements.map((r) => r.requirement),
      mrtLines: mrtLines,
    });
  } catch (error) {
    console.error("Error fetching matches:", error);
    res.status(500).send("Error loading matches");
  }
});

// API endpoint for infinite scroll
app.get("/api/matches", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const offset = (page - 1) * limit;

    // Get filter parameters
    const filters = {
      date: req.query.date || "",
      enddate: req.query.enddate || "",
      time: req.query.time || "",
      endtime: req.query.endtime || "",
      day: req.query.day || "",
      gameType: req.query.gameType || "",
      requirement: req.query.requirement || "",
      sorting: req.query.sorting || "",
      status: "APPROVED",
    };

    const sorting = req.query.sorting;

    let orderBy = "";

    if (sorting === "asc") {
      orderBy = "ORDER BY date ASC, time ASC";
    } else if (sorting === "desc") {
      orderBy = "ORDER BY date DESC, time DESC";
    } else {
      orderBy = "ORDER BY created_at DESC";
    }

    // Build WHERE clause
    let whereConditions = ["status = ?"];
    let queryParams = [filters.status];

    if (filters.date && filters.enddate) {
      whereConditions.push("date BETWEEN ? AND ?");
      queryParams.push(filters.date, filters.enddate);
    } else if (filters.date) {
      whereConditions.push("date >= ?");
      queryParams.push(filters.date);
    } else if (filters.enddate) {
      whereConditions.push("date <= ?");
      queryParams.push(filters.enddate);
    }

    if (filters.time && filters.endtime) {
      whereConditions.push("time BETWEEN ? AND ?");
      queryParams.push(filters.time, filters.endtime);
    } else if (filters.time) {
      whereConditions.push("time >= ?");
      queryParams.push(filters.time);
    } else if (filters.endtime) {
      whereConditions.push("time <= ?");
      queryParams.push(filters.endtime);
    }
    
    // Filter by day of week (Monday=1, Tuesday=2, ..., Sunday=7 in MySQL DAYOFWEEK)
    // MySQL DAYOFWEEK: 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday, 5=Thursday, 6=Friday, 7=Saturday
    const dayMap = {
      'Monday': 2,
      'Tuesday': 3,
      'Wednesday': 4,
      'Thursday': 5,
      'Friday': 6,
      'Saturday': 7,
      'Sunday': 1
    };
    if (filters.day && dayMap[filters.day]) {
      whereConditions.push("date IS NOT NULL AND DAYOFWEEK(date) = ?");
      queryParams.push(dayMap[filters.day]);
    }
    
    // Only filter by allowed game types
    const allowedGameTypes = ['5v5', '6v6', '7v7', '8v8', '9v9', '11v11'];
    if (filters.gameType && allowedGameTypes.includes(filters.gameType)) {
      whereConditions.push("game_type = ?");
      queryParams.push(filters.gameType);
    }
    
    // Filter by requirement (Looking For)
    if (filters.requirement) {
      whereConditions.push("requirement = ?");
      queryParams.push(filters.requirement);
    }

    const whereClause = "WHERE " + whereConditions.join(" AND ");

    // Get total count
    const countQuery = `SELECT COUNT(*) as total FROM football_matches ${whereClause}`;
    const [countResult] = await dbPool.execute(countQuery, queryParams);
    const totalMatches = countResult[0].total;

    // Get matches
    const matchesQuery = `
            SELECT 
                id,
                original_message,
                platform,
                entry,
                location,
                date,
                time,
                game_type,
                requirement,
                match_duration,
                match_pace,
                contact_url,
                status,
                created_at
            FROM football_matches 
            ${whereClause}
            ${orderBy}
            LIMIT ${limit} OFFSET ${offset}
        `;

    const [matches] =
      queryParams.length > 0
        ? await dbPool.execute(matchesQuery, queryParams)
        : await dbPool.query(matchesQuery);

    res.json({
      matches: matches,
      page: page,
      hasMore: offset + matches.length < totalMatches,
      total: totalMatches,
    });
  } catch (error) {
    console.error("Error fetching matches:", error);
    res.status(500).json({ error: "Error loading matches" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Public site running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || "development"}`);
});

module.exports = app;
