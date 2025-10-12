-- Database schema for OpenAI Parser Queue - Football Matches Only
-- This extends the existing kyna_admin database

-- Table to store football matches
CREATE TABLE IF NOT EXISTS football_matches (
    id INT PRIMARY KEY AUTO_INCREMENT,
    original_message TEXT NOT NULL,
    platform VARCHAR(50) NOT NULL,
    entry VARCHAR(100),
    location VARCHAR(255),
    date DATE,
    time TIME,
    game_type VARCHAR(50),
    contact_url VARCHAR(500),
    confidence DECIMAL(3,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    INDEX idx_platform (platform),
    INDEX idx_date (date),
    INDEX idx_time (time),
    INDEX idx_location (location),
    INDEX idx_game_type (game_type),
    INDEX idx_confidence (confidence),
    INDEX idx_created_at (created_at)
);
