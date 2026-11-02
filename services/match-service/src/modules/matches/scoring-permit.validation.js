import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ID.");

export const acquireScoringPermitSchema = z.object({
  scorerId: objectIdSchema,
  permissionVersion: z.number().int().min(1),
  requestId: z
    .string()
    .min(1)
    .max(128)
    .refine((value) => /\S/.test(value), "Request ID cannot be blank."),
}).strict();

export const releaseScoringPermitSchema = z.object({
  state: z.enum(["RELEASED_COMMITTED", "RELEASED_ABORTED"]),
}).strict();

export const scoringPermitIdSchema = z.string().uuid();
