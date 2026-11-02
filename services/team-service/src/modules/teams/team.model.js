import mongoose from "mongoose";

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    shortName: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      minlength: 2,
      maxlength: 10,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    homeGround: {
      type: String,
      trim: true,
      maxlength: 150,
      default: "",
    },

    playerIds: {
      type: [{
        type: mongoose.Schema.Types.ObjectId,
      }],
      default: [],
    },

    captainId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    viceCaptainId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

teamSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

teamSchema.index({ shortName: 1 }, { unique: true });

teamSchema.pre("validate", function validateTeam(next) {
  const playerIds = (this.playerIds || []).map((id) => id.toString());

  if (new Set(playerIds).size !== playerIds.length) {
    this.invalidate("playerIds", "A player cannot be added to a team more than once.");
  }

  if (this.captainId && !playerIds.includes(this.captainId.toString())) {
    this.invalidate("captainId", "The captain must belong to this team.");
  }

  if (this.viceCaptainId && !playerIds.includes(this.viceCaptainId.toString())) {
    this.invalidate("viceCaptainId", "The vice-captain must belong to this team.");
  }

  if (
    this.captainId &&
    this.viceCaptainId &&
    this.captainId.toString() === this.viceCaptainId.toString()
  ) {
    this.invalidate("viceCaptainId", "Captain and vice-captain must be different players.");
  }

  next();
});

export const Team = mongoose.model("Team", teamSchema);