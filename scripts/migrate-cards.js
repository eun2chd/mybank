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
  if (!(await columnExists(connection, "cards", "account_number"))) {
    await connection.query(`
      ALTER TABLE cards
        ADD COLUMN account_number VARCHAR(50) NULL COMMENT '체크카드 연결 계좌번호' AFTER card_type,
        ADD COLUMN card_number VARCHAR(50) NULL COMMENT '신용카드 번호' AFTER account_number,
        ADD COLUMN balance DECIMAL(15,2) NOT NULL DEFAULT 0 COMMENT '카드 잔액' AFTER card_number
    `);
    console.log("Added account_number, card_number, balance columns.");
  } else {
    console.log("New columns already exist - skip add.");
  }

  const fkName = await foreignKeyOnColumn(connection, "cards", "account_id");
  if (fkName) {
    await connection.query(`ALTER TABLE cards DROP FOREIGN KEY \`${fkName}\``);
    console.log(`Dropped foreign key ${fkName}.`);
  }

  for (const col of ["account_id", "billing_day", "payment_day"]) {
    if (await columnExists(connection, "cards", col)) {
      await connection.query(`ALTER TABLE cards DROP COLUMN ${col}`);
      console.log(`Dropped column ${col}.`);
    }
  }

  console.log("Cards table migration complete.");
} finally {
  await connection.end();
}
