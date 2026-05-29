import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: String,
    email: { type: String, unique: true },
    password: String,

    role: {
      type: String,
      enum: ["admin", "employee"],
      default: "employee",
    },

    phone: String,
    city: String,
    address: String,
    country: String,

    department: String,
    status: String,
    salary: Number,
    currency: String,
    joinDate: String,
    description: String,
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);