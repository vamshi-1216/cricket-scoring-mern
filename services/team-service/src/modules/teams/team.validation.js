import { z } from "zod";

export const createTeamSchema = z.object({
  name: z.string().trim().min(2, "Team name must contain at least 2 characters").max(100),
  shortName: z.string().trim().min(2).max(10).regex(
    /^[a-zA-Z0-9]+$/,
    "Short name must contain only letters and numbers"
  ),
  description: z.string().trim().max(500).optional().default(""),
  homeGround: z.string().trim().max(150).optional().default(""),
}).strict();

export const updateTeamSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  shortName: z.string().trim().min(2).max(10).regex(/^[a-zA-Z0-9]+$/).optional(),
  description: z.string().trim().max(500).optional(),
  homeGround: z.string().trim().max(150).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided.",
});

export const teamIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid team ID.");