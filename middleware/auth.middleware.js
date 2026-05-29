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

    if (!token || token === "undefined" || token === "null") {
      return res.status(401).json({ message: "Not authenticated" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const uid = decoded.id || decoded._id;
    if (!uid) return res.status(401).json({ message: "Token invalid" });

    // Simple await — no Promise.race
    let user = await User.findById(uid).select("-password").lean();
    if (!user) user = await Employee.findById(uid).select("-password").lean();
    if (!user) return res.status(401).json({ message: "User not found" });

    req.user     = user;
    req.userRole = decoded.role;
    next();

  } catch (err) {
    console.error("protect error:", err.message);
    return res.status(500).json({ message: "Auth error: " + err.message });
  }
};

export const adminOnly = (req, res, next) => {
  if (req.userRole !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};