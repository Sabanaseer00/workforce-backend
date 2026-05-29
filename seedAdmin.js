import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import User from "./models/User.js";

dotenv.config();

const seedAdmin = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  
  const existing = await User.findOne({ email: "admin@worktrack.com" });
  if (existing) {
    console.log("✅ Admin already exists");
    process.exit(0);
  }

  const hashedPassword = await bcrypt.hash("admin123", 10);
  
  await User.create({
    name: "Super Admin",
    email: "admin@worktrack.com",
    password: hashedPassword,
    role: "admin"
  });

  console.log("✅ Admin created!");
  console.log("📧 Email: admin@worktrack.com");
  console.log("🔑 Password: admin123");
  process.exit(0);
};

seedAdmin().catch(console.error);