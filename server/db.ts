import mysql from "mysql2/promise";

const requiredKeys = ["DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME"] as const;

export function hasDatabaseConfig() {
  return requiredKeys.every((key) => Boolean(process.env[key]));
}

export function createPool() {
  if (!hasDatabaseConfig()) {
    return null;
  }

  return mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 8,
    namedPlaceholders: true
  });
}

export type DbPool = ReturnType<typeof createPool>;
