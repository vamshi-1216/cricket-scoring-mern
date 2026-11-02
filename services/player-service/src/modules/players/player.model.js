
import mongoose from "mongoose";

const playerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    age: {
      type: Number,
      min: 5,
      max: 100,
      default: null,
    },
    battingStyle: {
      type: String,
      enum: ["right-handed", "left-handed"],
      default: "right-handed",
    },
    bowlingStyle: {
      type: String,
      trim: true,
      maxlength: 50,
      default: "",
    },
    role: {
        type: String,
        enum: [
            "batter",
            "bowler",
            "batting-all-rounder",
            "bowling-all-rounder",
            "wicket-keeper",],
            default: "batter",
            required: true,
    },
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

export const Player = mongoose.model("Player", playerSchema);
