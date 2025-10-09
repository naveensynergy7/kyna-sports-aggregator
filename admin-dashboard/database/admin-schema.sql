-- Admin Users Table
CREATE TABLE admin_users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Admin Sessions Table
CREATE TABLE admin_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- Telegram API Credentials Table
CREATE TABLE telegram_api_credentials (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    api_id VARCHAR(20) NOT NULL,
    api_hash VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_credentials (user_id)
);

-- Telegram Sessions Table
CREATE TABLE telegram_sessions (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    phone_number VARCHAR(20) NOT NULL,
    session_string TEXT,
    is_verified BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

-- Telegram Groups Table
CREATE TABLE telegram_groups (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL,
    group_id VARCHAR(50) NOT NULL,
    group_name VARCHAR(255) NOT NULL,
    username VARCHAR(255),
    is_monitoring BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_group (user_id, group_id)
);

-- Insert default admin user (email: admin@sportsapp.com, password: admin123)
INSERT INTO admin_users (email, password_hash) VALUES 
('admin@sportsapp.com', '$2a$10$l.2LimNRWrlIqWPn659aO.PTOZ2adl6JBMCqup2aylmOzekTHkOTm');
