import Settings from "../models/Settings.js";
import Employee from "../models/Employee.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import Screenshot from "../models/screenshot.js";
import Alert from "../models/Alert.js";

// ✅ GET SETTINGS
export const getSettings = async (req, res) => {
  try {
    let data = await Settings.findOne();
    if (!data) {
      data = await Settings.create({});
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ UPDATE SETTINGS
export const updateSettings = async (req, res) => {
  try {
    const data = await Settings.findOneAndUpdate(
      {},
      req.body,
      { new: true, upsert: true }
    );
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ CHANGE ADMIN PASSWORD
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Dono passwords required hain" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password kam az kam 6 characters ka hona chahiye" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ message: "Current password galat hai" });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: "Password successfully change ho gaya!" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ DELETE ALL SCREENSHOTS
export const deleteAllScreenshots = async (req, res) => {
  try {
    const result = await Screenshot.deleteMany({});
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ RESET ALL ALERTS
export const resetAllAlerts = async (req, res) => {
  try {
    const result = await Alert.deleteMany({});
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

