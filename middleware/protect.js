import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Employee from "../models/Employee.js";

export const protect = async (req, res, next) => {
  try {
    let token = null;

    if (req.headers.authorization?.startsWith("Bearer ")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token || token === "undefined") {
      return res.status(401).json({ message: "Not authenticated (no token)" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // ✅ Timeout ke saath User dhundo
    let user = await Promise.race([
      User.findById(decoded.id).select("-password").lean(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
    ]).catch(() => null);

    // ✅ User nahi mila toh Employee check karo
    if (!user) {
      user = await Promise.race([
        Employee.findById(decoded.id).select("-password").lean(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 5000))
      ]).catch(() => null);
    }

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.user = user;
    req.userRole = decoded.role;
    next();

  } catch (err) {
    console.error("Protect middleware error:", err);
    return res.status(500).json({ message: "Server error in auth" });
  }
};