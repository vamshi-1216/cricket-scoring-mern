import { z } from "zod";

export const playerRoleSchema = z.enum([
  "batter",
  "bowler",
  "batting-all-rounder",
  "bowling-all-rounder",
  "wicket-keeper",
]);

export const createPlayerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Player name must contain at least 2 characters")
      .max(100, "Player name cannot exceed 100 characters"),

    age: z.coerce
      .number()
      .int("Age must be a whole number")
      .min(5, "Age must be at least 5")
      .max(100, "Age cannot exceed 100")
      .optional(),

    role: playerRoleSchema.optional().default("batter"),

    battingStyle: z
      .enum(["right-handed", "left-handed"])
      .optional(),

    bowlingStyle: z
      .string()
      .trim()
      .max(50, "Bowling style cannot exceed 50 characters")
      .optional(),

    teamId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, "Invalid team ID")
      .optional(),
  })
  .strict();

export const updatePlayerSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Player name must contain at least 2 characters")
      .max(100, "Player name cannot exceed 100 characters")
      .optional(),

    age: z.coerce
      .number()
      .int("Age must be a whole number")
      .min(5, "Age must be at least 5")
      .max(100, "Age cannot exceed 100")
      .optional(),

    role: playerRoleSchema.optional(),

    battingStyle: z
      .enum(["right-handed", "left-handed"])
      .optional(),

    bowlingStyle: z
      .string()
      .trim()
      .max(50, "Bowling style cannot exceed 50 characters")
      .optional(),

    teamId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, "Invalid team ID")
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });