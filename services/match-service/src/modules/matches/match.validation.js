import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ID");

const matchFormats = ["T10", "T20", "ODI", "TEST", "CUSTOM"];

const baseMatchSchema = z.object({
  title: z.string().trim().min(2).max(100),
  teamAId: objectIdSchema,
  teamBId: objectIdSchema,
  format: z.enum(matchFormats).default("T20"),
  overs: z.coerce.number().int().min(1).max(450).default(20),
  inningsPerTeam: z.coerce
    .number()
    .int()
    .refine(
      (value) => value === 1 || value === 2,
      "Innings per team must be 1 or 2"
    )
    .default(1),
  venue: z.string().trim().max(150).default(""),
  matchDate: z.union([z.coerce.date(), z.null()]).optional().default(null),
  requiredPlayerCount: z.coerce.number().int().min(1).max(15).default(11),
});

export const createMatchSchema = baseMatchSchema
  .strict()
  .superRefine((data, ctx) => {
    if (data.teamAId.toLowerCase() === data.teamBId.toLowerCase()) {
      ctx.addIssue({
        code: "custom",
        path: ["teamBId"],
        message: "Choose two different teams.",
      });
    }

    if (data.format === "T10" && data.overs !== 10) {
      ctx.addIssue({
        code: "custom",
        path: ["overs"],
        message: "T10 matches must have 10 overs.",
      });
    }

    if (data.format === "T20" && data.overs !== 20) {
      ctx.addIssue({
        code: "custom",
        path: ["overs"],
        message: "T20 matches must have 20 overs.",
      });
    }

    if (data.format === "ODI" && data.overs !== 50) {
      ctx.addIssue({
        code: "custom",
        path: ["overs"],
        message: "ODI matches must have 50 overs.",
      });
    }

    if (data.format === "TEST" && data.inningsPerTeam !== 2) {
      ctx.addIssue({
        code: "custom",
        path: ["inningsPerTeam"],
        message: "Test matches must have two innings per team.",
      });
    }
  });

export const updateMatchSchema = z
  .object({
    title: z.string().trim().min(2).max(100).optional(),
    venue: z.string().trim().max(150).optional(),
    matchDate: z.union([z.coerce.date(), z.null()]).optional(),
    status: z.enum(["scheduled", "in_progress", "cancelled"]).optional(),
    tossWinnerId: objectIdSchema.nullable().optional(),
    tossDecision: z.enum(["bat", "bowl"]).nullable().optional(),
    battingFirstId: objectIdSchema.nullable().optional(),
    teamAPlayerIds: z.array(objectIdSchema).optional(),
    teamACaptainId: objectIdSchema.nullable().optional(),
    teamAWicketKeeperId: objectIdSchema.nullable().optional(),
    teamBPlayerIds: z.array(objectIdSchema).optional(),
    teamBCaptainId: objectIdSchema.nullable().optional(),
    teamBWicketKeeperId: objectIdSchema.nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  })
  .superRefine((data, ctx) => {
    const lineupFields = [
      "teamAPlayerIds",
      "teamACaptainId",
      "teamAWicketKeeperId",
      "teamBPlayerIds",
      "teamBCaptainId",
      "teamBWicketKeeperId",
    ];
    const suppliedLineupFields = lineupFields.filter((field) =>
      Object.hasOwn(data, field)
    );

    if (
      suppliedLineupFields.length > 0 &&
      suppliedLineupFields.length !== lineupFields.length
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Both team lineups, captains, and wicket-keepers must be provided together.",
      });
    }

    for (const [playerIdsField, captainField, wicketKeeperField] of [
      ["teamAPlayerIds", "teamACaptainId", "teamAWicketKeeperId"],
      ["teamBPlayerIds", "teamBCaptainId", "teamBWicketKeeperId"],
    ]) {
      const playerIds = data[playerIdsField];
      if (!playerIds) continue;

      if (playerIds.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: [playerIdsField],
          message: "Select at least one player for each team.",
        });
      }
      if (
        new Set(playerIds.map((id) => id.toLowerCase())).size !==
        playerIds.length
      ) {
        ctx.addIssue({
          code: "custom",
          path: [playerIdsField],
          message: "A player cannot appear more than once in a match squad.",
        });
      }
      if (
        !data[captainField] ||
        !playerIds.some(
          (id) => id.toLowerCase() === data[captainField].toLowerCase()
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: [captainField],
          message: "The captain must be selected in the match squad.",
        });
      }
      if (
        !data[wicketKeeperField] ||
        !playerIds.some(
          (id) => id.toLowerCase() === data[wicketKeeperField].toLowerCase()
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: [wicketKeeperField],
          message: "The wicket-keeper must be selected in the match squad.",
        });
      }
    }

    if (data.teamAPlayerIds && data.teamBPlayerIds) {
      const teamAPlayerIds = new Set(
        data.teamAPlayerIds.map((playerId) => playerId.toLowerCase())
      );

      if (
        data.teamBPlayerIds.some((playerId) =>
          teamAPlayerIds.has(playerId.toLowerCase())
        )
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["teamBPlayerIds"],
          message:
            "A player cannot be selected for both teams in the same match.",
        });
      }
    }
  });

export const confirmPlayingXISchema = z
  .object({
    teamAPlayerIds: z.array(objectIdSchema),
    teamBPlayerIds: z.array(objectIdSchema),
    reason: z.string().trim().max(300).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    for (const field of ["teamAPlayerIds", "teamBPlayerIds"]) {
      const ids = data[field].map((id) => id.toLowerCase());

      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: "Duplicate players are not allowed in a playing XI.",
        });
      }
    }

    const teamA = new Set(data.teamAPlayerIds.map((id) => id.toLowerCase()));
    if (
      data.teamBPlayerIds.some((id) => teamA.has(id.toLowerCase()))
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["teamBPlayerIds"],
        message: "A player cannot appear in both playing XIs.",
      });
    }
  });

export const matchIdSchema = objectIdSchema;
