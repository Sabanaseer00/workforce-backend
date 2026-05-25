import mongoose from "mongoose";

const screenshotSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    employeeId:   { type: String },
    empId:        { type: String },
    employeeName: { type: String, default: "Unknown" },
    department:   { type: String, default: "General" },
    role:         { type: String },

    app:         { type: String, default: "Unknown App" },
    windowTitle: { type: String },
    blockedApp:  { type: String },
    rawApp:      { type: String },

    // ✅ required: false so old documents (saved before imageUrl existed)
    // don't cause validation errors on read/update operations.
    // The upload controller already ensures new screenshots always have it.
    imageUrl:    { type: String, default: null },

    productivity: { type: Number, default: 0 },
    isBlocked:    { type: Boolean, default: false },

    time: { type: String },
    date: { type: String },
  },
  { timestamps: true }
);

// Prevent OverwriteModelError in dev (hot-reload) and serverless environments
const Screenshot =
  mongoose.models.Screenshot || mongoose.model("Screenshot", screenshotSchema);

export default Screenshot;