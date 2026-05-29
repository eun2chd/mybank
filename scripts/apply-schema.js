import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import mysql from "mysql2/promise";

const schemaPath = path.resolve("database/schema.sql");
const schema = await fs.readFile(schemaPath, "utf8");

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  charset: "utf8mb4",
  multipleStatements: true
});

await connection.query(schema);
await connection.end();

console.log(`Applied ${schemaPath}`);
