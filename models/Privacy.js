import mongoose from "mongoose";

const blockedAppSchema = new mongoose.Schema({
  appName:   { type: String, required: true },
  reason:    { type: String, default: ""    },
  blockedAt: { type: Date,   default: Date.now },
}, { _id: false });

const privacyPreferencesSchema = new mongoose.Schema({
  blockedApps:      { type: [blockedAppSchema], default: [] },
  screenshotPaused: { type: Boolean, default: false },
  consentGiven:     { type: Boolean, default: false },
  consentAt:        { type: Date },
  updatedAt:        { type: Date, default: Date.now },
}, { _id: false });

export { privacyPreferencesSchema, blockedAppSchema };