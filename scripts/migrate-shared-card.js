import "dotenv/config";
import mysql from "mysql2/promise";

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return Number(rows[0].count) > 0;
}

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table]
  );
  return Number(rows[0].count) > 0;
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4"
});

try {
  if (!(await columnExists(connection, "cards", "is_shared"))) {
    await connection.query(`
      ALTER TABLE cards
        ADD COLUMN is_shared BOOLEAN NOT NULL DEFAULT FALSE COMMENT '공용카드 여부' AFTER balance
    `);
    console.log("Added cards.is_shared");
  }

  if (!(await tableExists(connection, "card_members"))) {
    await connection.query(`
      CREATE TABLE card_members (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("Created card_members table");
  }

  if (!(await tableExists(connection, "card_usage_entries"))) {
    await connection.query(`
      CREATE TABLE card_usage_entries (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("Created card_usage_entries table");
  }

  console.log("Shared card migration complete.");
} finally {
  await connection.end();
}
