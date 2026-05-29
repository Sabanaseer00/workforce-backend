import mongoose from "mongoose";

const BlockedAppSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "App/website name is required"],
      trim: true,
    },

    identifier: {
      // e.g. "youtube.com" ya internal route "/employee/screenshots"
      type: String,
      required: [true, "Identifier is required"],
      trim: true,
      lowercase: true,
    },

    type: {
      type: String,
      enum: ["website", "internal"],
      default: "website",
    },

    isBlocked: {
      type: Boolean,
      default: true,
    },

    reason: {
      type: String,
      default: "",
      trim: true,
    },

    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

// Prevent duplicate identifiers
BlockedAppSchema.index({ identifier: 1 }, { unique: true });

const BlockedApp = mongoose.model("BlockedApp", BlockedAppSchema);

export default BlockedApp;