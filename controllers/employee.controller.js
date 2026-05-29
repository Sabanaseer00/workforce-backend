import Employee from "../models/Employee.js";
import bcrypt from "bcryptjs";

// Disposable email domains block list
const BLOCKED_DOMAINS = [
  "mailinator.com", "tempmail.com", "guerrillamail.com", "10minutemail.com",
  "throwaway.email", "yopmail.com", "sharklasers.com", "fakeinbox.com",
  "trashmail.com", "maildrop.cc", "dispostable.com", "spamgourmet.com",
  "temp-mail.org", "getnada.com", "mailnull.com", "spamherelots.com",
  "mailnesia.com", "spam4.me", "trashmail.at", "trashmail.me",
  "getairmail.com", "filzmail.com", "throwam.com", "tempr.email",
];

const isValidEmail = (email) => {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;
  const domain = email.split("@")[1]?.toLowerCase();
  if (BLOCKED_DOMAINS.includes(domain)) return false;
  return true;
};

// ===============================
// CREATE EMPLOYEE (REGISTER)
// ===============================
export const createEmployee = async (req, res) => {
  try {
    const data = req.body;

    // Email validation
    if (!isValidEmail(data.email)) {
      return res.status(400).json({
        message: "Invalid or disposable email address. Please use a real company or personal email.",
      });
    }

    // Check existing
    const exists = await Employee.findOne({
      email: data.email.toLowerCase().trim(),
    });
    if (exists) {
      return res.status(400).json({
        message: "An employee with this email already exists.",
      });
    }

    const hash = await bcrypt.hash(data.password, 10);

    const employee = await Employee.create({
      ...data,
      email: data.email.toLowerCase().trim(),
      password: hash,
    });

    res.status(201).json({
      message: "Employee created successfully",
      employee,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// GET ALL EMPLOYEES
// ===============================
export const getEmployees = async (req, res) => {
  try {
    const employees = await Employee.find().select("-password");
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// UPDATE EMPLOYEE
// ===============================
export const updateEmployee = async (req, res) => {
  try {
    const data = { ...req.body };

    // Agar email update ho rahi hai toh validate karo
    if (data.email) {
      if (!isValidEmail(data.email)) {
        return res.status(400).json({
          message: "Invalid or disposable email. Use a real email address.",
        });
      }

      // Check karo ke yeh email kisi aur employee ki toh nahi
      const emailExists = await Employee.findOne({
        email: data.email.toLowerCase().trim(),
        _id: { $ne: req.params.id },
      });
      if (emailExists) {
        return res.status(400).json({
          message: "This email is already used by another employee.",
        });
      }

      data.email = data.email.toLowerCase().trim();
    }

    // Password update ho rahi hai toh hash karo
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    const updated = await Employee.findByIdAndUpdate(
      req.params.id,
      data,
      { new: true }
    ).select("-password");

    if (!updated) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ===============================
// DELETE EMPLOYEE
// ===============================
export const deleteEmployee = async (req, res) => {
  try {
    const deleted = await Employee.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};