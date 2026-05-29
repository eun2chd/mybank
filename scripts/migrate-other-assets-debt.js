import "dotenv/config";
import mysql from "mysql2/promise";

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  charset: "utf8mb4"
});

try {
  await connection.query(`
    ALTER TABLE other_assets
    MODIFY COLUMN asset_type ENUM('deposit', 'loan', 'debt', 'other') NOT NULL DEFAULT 'other'
  `);
  console.log("other_assets.asset_type: added 'debt' (대출)");
} catch (error) {
  if (String(error?.message ?? "").includes("Duplicate") || String(error?.message ?? "").includes("debt")) {
    console.log("debt type already exists - skip.");
  } else {
    throw error;
  }
} finally {
  await connection.end();
}
