import { z } from "zod";

export const registerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),

    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((value) => value.toLowerCase())
      .optional(),

    phone: z
      .string()
      .trim()
      .regex(/^\+[1-9]\d{7,14}$/, {
        message: "Phone must use international format, e.g. +919876543210"
      })
      .optional(),

    password: z
      .string()
      .min(8)
      .max(72)
      .refine(
        (value) => Buffer.byteLength(value, "utf8") <= 72,
        "Password must not exceed 72 bytes"
      )
  })

  .strict()
  .refine(
    (data) => data.email !== undefined || data.phone !== undefined,
    {
      message: "Provide an email address or phone number",
      path: ["email"]
    }
  );
