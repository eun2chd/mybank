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

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4"
});

try {
  if (!(await columnExists(connection, "card_usage_entries", "billing_date"))) {
    await connection.query(`
      ALTER TABLE card_usage_entries
        ADD COLUMN billing_date DATE NULL COMMENT '결제포함 연월 (NULL이면 사용일 기준)' AFTER usage_date
    `);
    console.log("Added card_usage_entries.billing_date column.");
  } else {
    console.log("card_usage_entries.billing_date already exists - skip.");
  }
  console.log("Billing date migration complete.");
} finally {
  await connection.end();
}
