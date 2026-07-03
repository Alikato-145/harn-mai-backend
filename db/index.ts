import { createClient } from "@libsql/client";
import "dotenv/config";
import * as schema from "./schema";
import { drizzle } from "drizzle-orm/libsql";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
});

const db = drizzle(client, { schema });
export { db };
