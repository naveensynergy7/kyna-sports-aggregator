const express = require("express");
const mysql = require("mysql2/promise");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = express();
const PORT = process.env.PUBLIC_SITE_PORT || 3001;

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use("/css", express.static(path.join(__dirname, "css")));
app.use("/js", express.static(path.join(__dirname, "js")));

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

// Home route - show matches with filters
app.get("/", async (req, res) => {
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

    res.render("index", {
      filters: filters,
      availableDates: formattedDates,
      availableTimes: times.map((t) => t.time),
      availableGameTypes: filteredGameTypes,
      availableRequirements: requirements.map((r) => r.requirement),
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
