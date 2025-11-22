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
      gameType: req.query.gameType || "",
      startedSoon: req.query.startedSoon || "",
      status: "APPROVED",
    };

    // Get unique values for filter dropdowns (only from APPROVED matches)
    const [dates] = await dbPool.query(
      'SELECT DISTINCT date FROM football_matches WHERE date IS NOT NULL AND status = "APPROVED" ORDER BY date DESC LIMIT 50'
    );
    const [times] = await dbPool.query(
      'SELECT DISTINCT time FROM football_matches WHERE time IS NOT NULL AND status = "APPROVED" ORDER BY time LIMIT 50'
    );
    const [gameTypes] = await dbPool.query(
      'SELECT DISTINCT game_type FROM football_matches WHERE game_type IS NOT NULL AND status = "APPROVED" ORDER BY game_type LIMIT 50'
    );

    // Format dates to YYYY-MM-DD
    const formattedDates = dates.map((d) => {
      const date = new Date(d.date);
      return date.toISOString().split("T")[0];
    });

    res.render("index", {
      filters: filters,
      availableDates: formattedDates,
      availableTimes: times.map((t) => t.time),
      availableGameTypes: gameTypes.map((g) => g.game_type),
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
      gameType: req.query.gameType || "",
      startedSoon: req.query.startedSoon || "",
      status: "APPROVED",
    };

    const startedSoon = req.query.startedSoon;

    let orderBy = "";

    if (startedSoon === "asc") {
      orderBy = "ORDER BY date ASC, time ASC";
    } else if (startedSoon === "desc") {
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
    if (filters.gameType) {
      whereConditions.push("game_type = ?");
      queryParams.push(filters.gameType);
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
