import { z } from "zod";
import { DISMISSAL_TYPES } from "../scoring/scoring.rules.js";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ID");

export const matchIdSchema = objectIdSchema;
export const inningsIdSchema = objectIdSchema;

export const inningsInitializationSchema = z.object({
  matchId: objectIdSchema,
  inningsNumber: z.number().int().positive(),
  battingTeamId: objectIdSchema,
  bowlingTeamId: objectIdSchema,
  status: z.enum(["READY", "IN_PROGRESS", "COMPLETED", "ABANDONED"]),
});

const extrasSchema = z.object({
  wides: z.number().int().nonnegative().default(0),
  noBalls: z.number().int().nonnegative().default(0),
  byes: z.number().int().nonnegative().default(0),
  legByes: z.number().int().nonnegative().default(0),
  penaltyRuns: z.number().int().nonnegative().default(0),
}).strict().default({});

export const inningsPlayersSchema = z.object({
  strikerId: objectIdSchema,
  nonStrikerId: objectIdSchema,
  bowlerId: objectIdSchema,
}).strict();

export const deliveryEventSchema = z.object({
  eventType: z.enum(["NORMAL", "WIDE", "NO_BALL", "BYE", "LEG_BYE", "PENALTY"]),
  batRuns: z.number().int().refine(
    (value) => [0, 1, 2, 3, 4, 6].includes(value),
    "Batter runs must be 0, 1, 2, 3, 4, or 6."
  ).default(0),
  extras: extrasSchema,
  completedRuns: z.number().int().nonnegative().optional(),
  wicket: z.object({
    dismissalType: z.enum(DISMISSAL_TYPES),
    dismissedPlayerId: objectIdSchema,
    crossedBeforeWicket: z.boolean().default(false),
    fieldingAttribution: z.object({
      fielderIds: z.array(objectIdSchema).min(1),
      runOutType: z.enum(["DIRECT_HIT", "ASSISTED"]).optional(),
    }).strict().optional(),
  }).strict().optional(),
}).strict().superRefine((event, ctx) => {
  const wicket = event.wicket;
  const attribution = wicket?.fieldingAttribution;

  if (attribution) {
    const fielderIds = attribution.fielderIds.map((id) => id.toLowerCase());
    if (new Set(fielderIds).size !== fielderIds.length) {
      ctx.addIssue({
        code: "custom",
        path: ["wicket", "fieldingAttribution", "fielderIds"],
        message: "Fielder IDs must be unique.",
      });
    }

    if (wicket.dismissalType === "CAUGHT" || wicket.dismissalType === "STUMPED") {
      if (attribution.fielderIds.length !== 1) {
        ctx.addIssue({
          code: "custom",
          path: ["wicket", "fieldingAttribution", "fielderIds"],
          message: "A catch or stumping must have exactly one credited fielder.",
        });
      }
      if (attribution.runOutType !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["wicket", "fieldingAttribution", "runOutType"],
          message: "Run-out type can only be specified for a run-out.",
        });
      }
    } else if (wicket.dismissalType === "RUN_OUT") {
      if (attribution.runOutType === undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["wicket", "fieldingAttribution", "runOutType"],
          message: "A run-out requires DIRECT_HIT or ASSISTED classification.",
        });
      }
    } else {
      ctx.addIssue({
        code: "custom",
        path: ["wicket", "fieldingAttribution"],
        message: "Fielding attribution is only valid for catches, stumpings, and run-outs.",
      });
    }
  }

  if (
    wicket?.dismissalType === "CAUGHT" ||
    wicket?.dismissalType === "STUMPED" ||
    wicket?.dismissalType === "RUN_OUT"
  ) {
    if (!attribution) {
      ctx.addIssue({
        code: "custom",
        path: ["wicket", "fieldingAttribution"],
        message: "This dismissal requires fielding attribution.",
      });
    }
  }

  if (
    wicket?.crossedBeforeWicket &&
    wicket.dismissalType !== "RUN_OUT"
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["wicket", "crossedBeforeWicket"],
      message: "Only a run-out can specify crossing before dismissal.",
    });
  }
});
