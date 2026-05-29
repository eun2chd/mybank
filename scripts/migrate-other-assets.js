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
    CREATE TABLE IF NOT EXISTS other_assets (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id BIGINT NOT NULL,
      name VARCHAR(100) NOT NULL,
      asset_type ENUM('deposit', 'loan', 'other') NOT NULL DEFAULT 'other',
      amount DECIMAL(15,2) NOT NULL DEFAULT 0,
      expected_return_date DATE NULL,
      memo TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);
  console.log("other_assets table ready.");
} finally {
  await connection.end();
}
