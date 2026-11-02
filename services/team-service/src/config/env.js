import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4004),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  PLAYER_SERVICE_URL: z.string().url().default("http://localhost:4002"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid Team Service environment:", result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;