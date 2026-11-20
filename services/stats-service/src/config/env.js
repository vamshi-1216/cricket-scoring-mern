import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4006),

  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),

  MATCH_SERVICE_URL: z
    .string()
    .url()
    .default("http://localhost:4003"),

  SCORING_SERVICE_URL: z
    .string()
    .url()
    .default("http://localhost:4005"),

  INTERNAL_SERVICE_SECRET: z
    .string()
    .min(32, "INTERNAL_SERVICE_SECRET must be at least 32 characters")
    .optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("Invalid Stats Service environment configuration:");

  console.error(
    parsedEnv.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }))
  );

  process.exit(1);
}

export const env = parsedEnv.data;
