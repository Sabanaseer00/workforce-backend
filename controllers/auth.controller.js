import User from "../models/User.js";
import Employee from "../models/Employee.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getIO } from "../config/socket.js";

// ================================
// 🔐 LOGIN
// ================================
export const login = async (req, res) => {
  try {
    const { email, password, role } = req.body;
    if (!email || !password || !role) {
      return res.status(400).json({
        message: "Email, password aur role required hain.",
      });
    }

    // ======================
    // 🔍 FIND USER (ADMIN)
    // ======================
    let user = await User.findOne({ email });
    let actualRole = "admin";

    // ======================
    // 🔍 FIND EMPLOYEE
    // ======================
    if (!user) {
      user = await Employee.findOne({ email });
      actualRole = "employee";
    }

    // ❌ USER NOT FOUND
    if (!user) {
      return res.status(404).json({
        message: "User not found. Admin se contact karein.",
      });
    }

    // ❌ ROLE CHECK FIXED
    if (actualRole !== role) {
      return res.status(403).json({
        message: `Yeh account '${actualRole}' role ka hai. Sahi role select karein.`,
      });
    }

    // 🔐 PASSWORD CHECK
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Password galat hai.",
      });
    }

    // 🔑 TOKEN GENERATE
    const token = jwt.sign(
      { id: user._id, role: actualRole },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ✅ EMPLOYEE LOGIN → Online set karo
    if (actualRole === "employee") {
      await Employee.findByIdAndUpdate(user._id, {
        status: "Online",
        lastSeen: new Date(),
      });

      // Socket se admin ko real-time update bhejo
      const io = getIO();
      if (io) {
        io.to("admins").emit("employee:update", {
          employeeId: user._id.toString(),
          status: "Online",
          lastSeen: new Date(),
        });
      }
    }

    // ✅ RESPONSE
    res.json({
      token,
      role: actualRole,
      user: {
        id: user._id,
        name: user.name || user.firstName,
        email: user.email,
        role: actualRole,
      },
    });
  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({
      message: "Server error. Dobara try karein.",
    });
  }
};

// ================================
// 🌱 SEED ADMIN (ONE TIME)
// ================================
export const seedAdmin = async (req, res) => {
  try {
    const existing = await User.findOne({
      email: "admin@worktrack.com",
    });
    if (existing) {
      return res.json({
        message: "✅ Admin pehle se exist karta hai!",
      });
    }
    const hashedPassword = await bcrypt.hash("admin123", 10);
    await User.create({
      name: "Super Admin",
      email: "admin@worktrack.com",
      password: hashedPassword,
      role: "admin",
    });
    res.json({
      message: "✅ Admin successfully create ho gaya!",
      email: "admin@worktrack.com",
      password: "admin123",
    });
  } catch (err) {
    console.error("Seed error:", err.message);
    res.status(500).json({
      message: err.message,
    });
  }
};