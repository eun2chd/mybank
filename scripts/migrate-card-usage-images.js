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
  if (!(await columnExists(connection, "card_usage_entries", "images"))) {
    await connection.query(`
      ALTER TABLE card_usage_entries
        ADD COLUMN images MEDIUMTEXT NULL COMMENT '스크린샷 이미지 배열 (JSON base64)' AFTER memo
    `);
    console.log("Added card_usage_entries.images column.");
  } else {
    console.log("card_usage_entries.images already exists - skip.");
  }
  console.log("Card usage images migration complete.");
} finally {
  await connection.end();
}
