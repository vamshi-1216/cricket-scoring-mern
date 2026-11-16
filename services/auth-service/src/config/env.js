
import { z } from "zod";

// --------------------------------------------------
// Environment schema
// --------------------------------------------------

const envSchema = z
  .object({
    // Application
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(4001),

    FRONTEND_ORIGIN: z
      .url("FRONTEND_ORIGIN must be a valid URL.")
      .refine(
        (value) => {
          try {
            const url = new URL(value);

            return (
              ["http:", "https:"].includes(url.protocol) &&
              url.pathname === "/" &&
              !url.search &&
              !url.hash
            );
          } catch {
            return false;
          }
        },
        {
          message:
            "FRONTEND_ORIGIN must be an HTTP or HTTPS origin without a path, query, or hash.",
        }
      ),

    // Database
    MONGODB_URI: z
      .string()
      .trim()
      .min(1, "MONGODB_URI is required.")
      .refine(
        (value) => /^mongodb(\+srv)?:\/\//i.test(value),
        "MONGODB_URI must start with mongodb:// or mongodb+srv://."
      ),

    // Email SMTP configuration
    EMAIL_HOST: z
      .string()
      .trim()
      .min(1)
      .default("smtp.gmail.com"),

    EMAIL_PORT: z.coerce
      .number()
      .int()
      .min(1)
      .max(65535)
      .default(465),

    EMAIL_USER: z
      .email()
      .or(z.literal(""))
      .default(""),

    EMAIL_PASSWORD: z
      .string()
      .default(""),

    EMAIL_FROM: z
      .email()
      .or(z.literal(""))
      .default(""),

    // MSG91 phone verification
    MSG91_AUTH_KEY: z
      .string()
      .trim()
      .min(1, "MSG91_AUTH_KEY is required."),

    // Google Sign-In
    GOOGLE_CLIENT_ID: z
      .string()
      .trim()
      .min(1, "GOOGLE_CLIENT_ID is required."),

    // JWT configuration
    JWT_SECRET: z
      .string()
      .trim()
      .min(32, "JWT_SECRET must be at least 32 characters."),

    JWT_EXPIRES_IN: z
      .string()
      .trim()
      .min(1, "JWT_EXPIRES_IN cannot be empty.")
      .default("15m"),

    // Internal microservice authentication
    INTERNAL_SERVICE_SECRET: z
      .string()
      .trim()
      .min(
        32,
        "INTERNAL_SERVICE_SECRET must be at least 32 characters."
      ),
  })
  .superRefine((data, ctx) => {
    // Email configuration is optional as a whole.
    // If any email credential is supplied, require all three.

    const emailConfigurationStarted = Boolean(
      data.EMAIL_USER ||
      data.EMAIL_PASSWORD ||
      data.EMAIL_FROM
    );

    if (!emailConfigurationStarted) {
      return;
    }

    if (!data.EMAIL_USER) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_USER"],
        message: "EMAIL_USER is required when email is configured.",
      });
    }

    if (!data.EMAIL_PASSWORD.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_PASSWORD"],
        message: "EMAIL_PASSWORD is required when email is configured.",
      });
    }

    if (!data.EMAIL_FROM) {
      ctx.addIssue({
        code: "custom",
        path: ["EMAIL_FROM"],
        message: "EMAIL_FROM is required when email is configured.",
      });
    }
  });

// --------------------------------------------------
// Validate process environment
// --------------------------------------------------

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("\nInvalid environment configuration:\n");

  for (const issue of result.error.issues) {
    const field = issue.path.join(".") || "environment";

    console.error(`- ${field}: ${issue.message}`);
  }

  console.error("\nAuth Service startup aborted.\n");

  process.exit(1);
}

// --------------------------------------------------
// Export immutable configuration
// --------------------------------------------------

export const env = Object.freeze(result.data);
