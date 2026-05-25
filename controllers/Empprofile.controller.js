// ═══════════════════════════════════════════════════════
//  controllers/empProfile.controller.js
//  Employee apni profile dekhta aur update karta hai
// ═══════════════════════════════════════════════════════
import Employee from "../models/Employee.js";

// ════════════════════════════════════════════════════════
//  GET /api/emp/profile
//  Employee apni profile dekhta hai
// ════════════════════════════════════════════════════════
export const getMyProfile = async (req, res) => {
  try {
    const emp = await Employee.findById(req.user._id).select("-password");
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    res.json(emp);
  } catch (err) {
    console.error("getMyProfile error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════
//  PUT /api/emp/profile
//  Employee apni profile update karta hai
//  Sirf basic fields — role, salary, department nahi badal sakta
// ════════════════════════════════════════════════════════
export const updateMyProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, city, country, description } = req.body;

    const updated = await Employee.findByIdAndUpdate(
      req.user._id,
      { firstName, lastName, phone, city, country, description },
      { new: true }
    ).select("-password");

    if (!updated) return res.status(404).json({ message: "Employee not found" });
    res.json(updated);
  } catch (err) {
    console.error("updateMyProfile error:", err.message);
    res.status(500).json({ message: err.message });
  }
};