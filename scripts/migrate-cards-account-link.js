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

async function foreignKeyOnColumn(connection, table, column) {
  const [rows] = await connection.query(
    `SELECT CONSTRAINT_NAME AS name
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?
       AND REFERENCED_TABLE_NAME IS NOT NULL`,
    [table, column]
  );
  return rows[0]?.name ?? null;
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
  if (!(await columnExists(connection, "cards", "account_id"))) {
    await connection.query(`
      ALTER TABLE cards
        ADD COLUMN account_id BIGINT NULL COMMENT '연결 계좌' AFTER card_type
    `);
    console.log("Added cards.account_id column.");
  } else {
    console.log("cards.account_id already exists - skip add.");
  }

  const fkName = await foreignKeyOnColumn(connection, "cards", "account_id");
  if (!fkName) {
    await connection.query(`
      ALTER TABLE cards
        ADD CONSTRAINT fk_cards_account
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    `);
    console.log("Added fk_cards_account foreign key.");
  } else {
    console.log(`Foreign key ${fkName} already exists - skip.`);
  }

  console.log("Cards account link migration complete.");
} finally {
  await connection.end();
}
