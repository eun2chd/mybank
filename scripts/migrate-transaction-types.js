import "dotenv/config";
import mysql from "mysql2/promise";

const DEFAULT_TYPES = [
  ["expense", "소비", "expense", 1],
  ["income", "수입", "income", 2],
  ["subscription", "구독", "expense", 3],
  ["investment_buy", "투자 매수", "expense", 4],
  ["investment_sell", "투자 매도", "income", 5],
  ["deposit", "입금", "income", 6],
  ["withdrawal", "출금", "expense", 7],
  ["transfer", "이체", "neutral", 8]
];

async function tableExists(connection, table) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.TABLES
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
  if (!(await tableExists(connection, "transaction_types"))) {
    await connection.query(`
      CREATE TABLE transaction_types (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("Created transaction_types table.");
  } else {
    console.log("transaction_types table already exists - skip create.");
  }

  const [users] = await connection.query(`SELECT id FROM users`);
  for (const user of users) {
    for (const [code, name, kind, sortOrder] of DEFAULT_TYPES) {
      await connection.query(
        `INSERT IGNORE INTO transaction_types (user_id, code, name, kind, sort_order, is_system)
         VALUES (?, ?, ?, ?, ?, TRUE)`,
        [user.id, code, name, kind, sortOrder]
      );
    }
  }
  console.log(`Seeded default types for ${users.length} user(s).`);

  const [colRows] = await connection.query(
    `SELECT DATA_TYPE AS dataType
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'transactions' AND COLUMN_NAME = 'transaction_type'`
  );
  if (colRows[0]?.dataType === "enum") {
    await connection.query(`
      ALTER TABLE transactions
        MODIFY transaction_type VARCHAR(50) NOT NULL
    `);
    console.log("Changed transactions.transaction_type to VARCHAR(50).");
  } else {
    console.log("transactions.transaction_type is already VARCHAR - skip alter.");
  }

  console.log("Transaction types migration complete.");
} finally {
  await connection.end();
}
