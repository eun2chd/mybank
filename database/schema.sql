CREATE DATABASE IF NOT EXISTS mybank
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE mybank;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE,
  nickname VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255),
  provider ENUM('local', 'google', 'kakao', 'naver') DEFAULT 'local',
  provider_id VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS accounts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  bank_name VARCHAR(50) NOT NULL,
  account_name VARCHAR(100) NOT NULL,
  account_number VARCHAR(50),
  balance DECIMAL(15,2) DEFAULT 0,
  account_type ENUM('checking', 'savings', 'investment', 'cash') DEFAULT 'checking',
  is_active BOOLEAN DEFAULT TRUE,
  memo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS cards (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  card_company VARCHAR(50) NOT NULL,
  card_name VARCHAR(100) NOT NULL,
  card_type ENUM('debit', 'credit') NOT NULL,
  account_id BIGINT NULL,
  account_number VARCHAR(50) NULL COMMENT '체크카드 연결 계좌번호(연동 시 자동)',
  card_number VARCHAR(50) NULL COMMENT '신용카드 번호',
  balance DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '카드 잔액',
  is_shared BOOLEAN NOT NULL DEFAULT FALSE COMMENT '공용카드',
  is_active BOOLEAN DEFAULT TRUE,
  memo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS card_members (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  name VARCHAR(50) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  UNIQUE KEY uk_card_member_name (card_id, name)
);

CREATE TABLE IF NOT EXISTS card_usage_entries (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  card_member_id BIGINT NOT NULL,
  usage_date DATE NOT NULL,
  payment_plan ENUM('lump_sum', 'installment') NOT NULL DEFAULT 'lump_sum',
  product_name VARCHAR(200) NOT NULL,
  product_url VARCHAR(500) NULL,
  principal_amount DECIMAL(15,2) NOT NULL,
  monthly_payment DECIMAL(15,2) NOT NULL,
  installment_months INT NOT NULL DEFAULT 1,
  memo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  FOREIGN KEY (card_member_id) REFERENCES card_members(id) ON DELETE RESTRICT,
  INDEX idx_card_usage_card_date (card_id, usage_date),
  INDEX idx_card_usage_member (card_member_id)
);

CREATE TABLE IF NOT EXISTS other_assets (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  asset_type ENUM('deposit', 'loan', 'debt', 'other') NOT NULL DEFAULT 'other' COMMENT 'debt=대출(부채, 음수)',
  amount DECIMAL(15,2) NOT NULL DEFAULT 0,
  expected_return_date DATE NULL,
  memo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT,
  name VARCHAR(50) NOT NULL,
  type ENUM('expense', 'income', 'investment', 'transfer', 'subscription') NOT NULL,
  color VARCHAR(20),
  icon VARCHAR(50),
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  image_url MEDIUMTEXT NULL,
  amount DECIMAL(15,2) NOT NULL,
  billing_cycle ENUM('monthly', 'yearly', 'weekly', 'custom') DEFAULT 'monthly',
  payment_day INT,
  next_payment_date DATE,
  account_id BIGINT NULL,
  card_id BIGINT NULL,
  category_id BIGINT NULL,
  status ENUM('active', 'paused', 'cancelled') DEFAULT 'active',
  started_at DATE,
  ended_at DATE,
  memo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (card_id) REFERENCES cards(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS investments (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  asset_type ENUM('stock', 'coin', 'fund', 'etc') NOT NULL,
  market VARCHAR(50),
  symbol VARCHAR(50),
  name VARCHAR(100) NOT NULL,
  total_buy_amount DECIMAL(15,2) DEFAULT 0,
  total_quantity DECIMAL(20,8) DEFAULT 0,
  average_price DECIMAL(15,2) DEFAULT 0,
  current_price DECIMAL(15,2) DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
  original_price DECIMAL(20,6) DEFAULT NULL,
  memo TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS transaction_types (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  code VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  kind ENUM('expense', 'income', 'neutral') NOT NULL DEFAULT 'expense',
  sort_order INT DEFAULT 0,
  is_system BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE KEY uk_transaction_types_user_code (user_id, code)
);

CREATE TABLE IF NOT EXISTS transactions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  transaction_date DATE NOT NULL,
  transaction_type VARCHAR(50) NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  account_id BIGINT,
  card_id BIGINT,
  category_id BIGINT,
  merchant VARCHAR(100),
  title VARCHAR(100),
  memo TEXT,
  payment_method ENUM('account', 'card', 'cash') NOT NULL,
  installment_months INT DEFAULT 1,
  subscription_id BIGINT NULL,
  investment_id BIGINT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (card_id) REFERENCES cards(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id),
  FOREIGN KEY (investment_id) REFERENCES investments(id),
  INDEX idx_transactions_user_date (user_id, transaction_date),
  INDEX idx_transactions_user_type (user_id, transaction_type)
);

CREATE TABLE IF NOT EXISTS investment_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT NOT NULL,
  investment_id BIGINT NOT NULL,
  transaction_id BIGINT NULL,
  log_type ENUM('buy', 'sell', 'dividend', 'profit', 'loss', 'price_update') NOT NULL,
  quantity DECIMAL(20,8) DEFAULT 0,
  price DECIMAL(15,2) DEFAULT 0,
  amount DECIMAL(15,2) NOT NULL,
  log_date DATE NOT NULL,
  memo TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (investment_id) REFERENCES investments(id),
  FOREIGN KEY (transaction_id) REFERENCES transactions(id),
  INDEX idx_investment_logs_user_date (user_id, log_date)
);

INSERT INTO categories (user_id, name, type, color, sort_order)
SELECT NULL, '식비', 'expense', '#2F80ED', 1
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = '식비');

INSERT INTO categories (user_id, name, type, color, sort_order)
SELECT NULL, '교통', 'expense', '#4D96FF', 2
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = '교통');

INSERT INTO categories (user_id, name, type, color, sort_order)
SELECT NULL, '쇼핑', 'expense', '#7FB4FF', 3
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = '쇼핑');

INSERT INTO categories (user_id, name, type, color, sort_order)
SELECT NULL, '구독', 'subscription', '#5B5BD6', 4
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = '구독');

INSERT INTO categories (user_id, name, type, color, sort_order)
SELECT NULL, '통신비', 'expense', '#4D96FF', 5
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = '통신비');

INSERT INTO categories (user_id, name, type, color, sort_order)
SELECT NULL, '서버비', 'expense', '#2F80ED', 6
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = '서버비');

INSERT INTO categories (user_id, name, type, color, sort_order)
SELECT NULL, '투자', 'investment', '#3FD68C', 7
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = '투자');

INSERT INTO categories (user_id, name, type, color, sort_order)
SELECT NULL, '월급', 'income', '#3FD68C', 8
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = '월급');

INSERT INTO categories (user_id, name, type, color, sort_order)
SELECT NULL, '기타', 'expense', '#8B949E', 99
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE user_id IS NULL AND name = '기타');
