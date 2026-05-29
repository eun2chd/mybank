import "dotenv/config";
import mysql from "mysql2/promise";

async function columnExists(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT COUNT(*) AS count
     FROM information_schema.COLUMNS
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
  if (!(await columnExists(connection, "subscriptions", "image_url"))) {
    await connection.query(`
      ALTER TABLE subscriptions
        ADD COLUMN image_url MEDIUMTEXT NULL COMMENT '구독 로고 URL 또는 data URL' AFTER name
    `);
    console.log("Added subscriptions.image_url column.");
  } else {
    console.log("subscriptions.image_url already exists - skip.");
  }
  console.log("Subscriptions image migration complete.");
} finally {
  await connection.end();
}
