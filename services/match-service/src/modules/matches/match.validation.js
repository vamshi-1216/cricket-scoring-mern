import { z } from "zod";

const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, "Invalid MongoDB ID");

const matchFormats = ["T10", "T20", "ODI", "TEST", "CUSTOM"];

const baseMatchSchema = z.object({
  title: z.string().trim().min(2).max(100),
  teamAId: objectIdSchema,
  teamBId: objectIdSchema,
  format: z.enum(matchFormats).default("T20"),
  overs: z.coerce.number().int().min(1).max(450).default(20),
  inningsPerTeam: z.coerce.number().int().refine(
    (value) => value === 1 || value === 2,
    "Innings per team must be 1 or 2"
  ).default(1),
  venue: z.string().trim().max(150).default(""),
  matchDate: z.union([z.coerce.date(), z.null()]).optional().default(null),
});

export const createMatchSchema = baseMatchSchema.strict().superRefine((data, ctx) => {
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

export const updateMatchSchema = z.object({
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
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "At least one field must be provided.",
}).superRefine((data, ctx) => {
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

  if (suppliedLineupFields.length > 0 && suppliedLineupFields.length !== lineupFields.length) {
    ctx.addIssue({
      code: "custom",
      message: "Both team lineups, captains, and wicket-keepers must be provided together.",
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
    if (new Set(playerIds).size !== playerIds.length) {
      ctx.addIssue({
        code: "custom",
        path: [playerIdsField],
        message: "A player cannot appear more than once in a match squad.",
      });
    }
    if (!data[captainField] || !playerIds.includes(data[captainField])) {
      ctx.addIssue({
        code: "custom",
        path: [captainField],
        message: "The captain must be selected in the match squad.",
      });
    }
    if (!data[wicketKeeperField] || !playerIds.includes(data[wicketKeeperField])) {
      ctx.addIssue({
        code: "custom",
        path: [wicketKeeperField],
        message: "The wicket-keeper must be selected in the match squad.",
      });
    }
  }

  if (data.teamAPlayerIds && data.teamBPlayerIds) {
    const teamAPlayerIds = new Set(
      data.teamAPlayerIds.map((playerId) => String(playerId).toLowerCase())
    );

    if (
      data.teamBPlayerIds.some((playerId) =>
        teamAPlayerIds.has(String(playerId).toLowerCase())
      )
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["teamBPlayerIds"],
        message: "A player cannot be selected for both teams in the same match.",
      });
    }
  }
});

export const matchIdSchema = objectIdSchema;