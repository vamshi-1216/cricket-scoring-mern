import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: 100
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      maxlength: 254
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true
    },

    passwordHash: {
      type: String,
      select: false
    },

    authProviders: {
      type: [
        {
          provider: {
            type: String,
            enum: ["local", "google", "github"],
            required: true
          },
          providerId: {
            type: String,
            required: true
          }
        }
      ],
      default: []
    },

    emailVerified: {
      type: Boolean,
      default: false
    },

    phoneVerified: {
      type: Boolean,
      default: false
    },
    
    emailVerification: {
  otpHash: {
    type: String,
    select: false,
    default: undefined
  },
  expiresAt: {
    type: Date,
    default: undefined
  },
  attempts: {
    type: Number,
    default: 0
  },
  lastSentAt: {
    type: Date,
    default: undefined
  }
},

phoneVerification: {
  otpHash: {
    type: String,
    select: false,
    default: undefined
  },
  expiresAt: {
    type: Date,
    default: undefined
  },
  attempts: {
    type: Number,
    default: 0
  },
  lastSentAt: {
    type: Date,
    default: undefined
  }
},
      passwordReset: {
  tokenHash: {
    type: String,
    select: false,
    default: undefined,
  },
  expiresAt: {
    type: Date,
    default: undefined,
  },
},

          phonePasswordReset: {
      tokenHash: {
        type: String,
        select: false,
        default: undefined,
      },
      expiresAt: {
        type: Date,
        default: undefined,
      },
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user"
    },

    sessionVersion: {
  type: Number,
  default: 0,
  min: 0,
},
    status: {
      type: String,
      enum: ["active", "pending_verification", "suspended"],
      default: "pending_verification"
    },

    lastLoginAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

userSchema.index({ "authProviders.provider": 1, "authProviders.providerId": 1 });

export const User = mongoose.model("User", userSchema);