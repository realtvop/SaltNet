import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const pgClient = postgres(process.env.DATABASE_URL!);
export const db = drizzle(pgClient, { schema });
export { schema };
