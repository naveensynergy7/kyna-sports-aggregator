-- Database schema for OpenAI Parser Queue - Football Matches Only
-- This extends the existing kyna_admin database

-- Set default character set to utf8mb4 for full Unicode support (including emojis)
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- Table to store football matches
CREATE TABLE IF NOT EXISTS football_matches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    original_message TEXT NOT NULL,                    -- Can store up to 65,535 chars (plenty for 1000 words)
    platform VARCHAR(50) NOT NULL,
    entry VARCHAR(100),
    location VARCHAR(500),                             -- Increased to 500 chars (enough for 50+ words)
    date DATE,                                         -- Date in MySQL DATE format (YYYY-MM-DD)
    time TIME,                                         -- Time in MySQL TIME format (HH:MM:SS)
    game_type VARCHAR(500),                            -- Increased to 500 chars (enough for 50+ words)
    requirement TEXT,                                  -- Requirements or conditions for the game
    other_details TEXT,                                -- Any additional details about the match
    contact_url VARCHAR(500),
    match_duration INT,                                -- Duration in minutes
    match_pace VARCHAR(100),                           -- Pace description (e.g., "fast", "moderate", "slow")
    status enum('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    confidence DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_date (date),
    INDEX idx_time (time),
    INDEX idx_location (location),
    INDEX idx_game_type (game_type),
    INDEX idx_created_at (created_at),
    INDEX idx_match_duration (match_duration),
    INDEX idx_match_pace (match_pace)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
