/**
 * Prisma 7 config — connection URL lives here, not in schema.prisma.
 *
 * APP_MODE=cloud (default): PostgreSQL via pg
 *   DATABASE_URL → postgres connection string
 *
 * APP_MODE=local: SQLite via better-sqlite3
 *   DATABASE_URL → "file:./dev.db" (dev) or injected by Electron at runtime
 */
import "dotenv/config";
import { defineConfig } from "prisma/config";

const isCloud = process.env.APP_MODE === "cloud";

export default defineConfig({
  schema: isCloud ? "prisma-pg/schema.prisma" : "prisma/schema.prisma",
  migrations: {
    path: isCloud ? "prisma-pg/migrations" : "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
