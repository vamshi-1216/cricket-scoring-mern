
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(4001),

  FRONTEND_ORIGIN: z.url(),

  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),

  // Email SMTP configuration
  EMAIL_HOST: z.string().default("smtp.gmail.com"),

  EMAIL_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(465),

  EMAIL_USER: z.email().optional().default(""),

  EMAIL_PASSWORD: z.string().default(""),

  EMAIL_FROM: z.email().optional().default(""),

  // MSG91 phone verification
  MSG91_AUTH_KEY: z.string().min(1),

  // Google Sign-In
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),

  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  JWT_EXPIRES_IN: z.string().default("15m"),
  });

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration:");

  for (const issue of result.error.issues) {
    console.error(`- ${issue.path.join(".")}: ${issue.message}`);
  }

  process.exit(1);
}

export const env = Object.freeze(result.data);
