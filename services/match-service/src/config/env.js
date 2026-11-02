import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(4003),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TEAM_SERVICE_URL: z.string().url().default("http://localhost:4004"),
  SCORING_SERVICE_URL: z.string().url().default("http://localhost:4005"),
  AUTH_SERVICE_URL: z.string().url().default("http://localhost:4001"),
  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(32)
    .refine((value) => /\S/.test(value), "INTERNAL_SERVICE_SECRET cannot be blank.")
    .optional(),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid Match Service environment:", result.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = result.data;