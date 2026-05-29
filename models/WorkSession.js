import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema({
  userId: mongoose.Schema.Types.ObjectId,
  clockIn: Date,
  clockOut: Date
});

export default mongoose.model("WorkSession", sessionSchema);