import express from "express";
import Screenshot from "../models/screenshot.js";
import { protect } from "../middleware/auth.middleware.js";
import { createAlertFromScreenshot } from "../controllers/alert.controller.js";

const router = express.Router();

// ✅ SAVE — Electron bhejta hai (POST /live)
router.post("/live", async (req, res) => {
  try {
    const {
      imageUrl, employeeId, empId, employeeName,
      department, role, app, windowTitle, blockedApp,
      time, date, productivity, isBlocked
    } = req.body;

    if (!imageUrl) return res.status(400).json({ success: false, reason: "No image" });

    const sizeInMB = Buffer.byteLength(imageUrl, "utf8") / (1024 * 1024);
    if (sizeInMB > 12) return res.json({ success: false, reason: "Too large" });

    let shot = null;
    for (let i = 0; i < 3; i++) {
      try {
        shot = await Screenshot.create({
          imageUrl, employeeId, empId, employeeName,
          department, role, app, windowTitle, blockedApp,
          time, date,
          productivity: productivity || 0,
          isBlocked: isBlocked || false,
        });
        break;
      } catch (e) {
        console.error(`Screenshot save attempt ${i + 1} failed:`, e.message);
        await new Promise((r) => setTimeout(r, 2000));
      }
    }

    if (!shot) return res.status(500).json({ success: false, reason: "Save failed after 3 attempts" });

    try {
      await createAlertFromScreenshot({
        employeeId, empId, employeeName, department,
        app, windowTitle, blockedApp, isBlocked,
        productivity: productivity || 0,
        screenshotId: shot._id,
        time, date,
      });
    } catch (alertErr) {
      console.error("Alert error (non-fatal):", alertErr.message);
    }

    res.json({ success: true, id: shot._id });
  } catch (err) {
    console.error("Screenshot POST /live error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET ALL — imageUrl EXCLUDE (metadata only — fast load)
// ✅ KEY FIX: 1000+ base64 images ek saath bhejne se memory crash hoti thi
router.get("/live", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 300;
    const page  = parseInt(req.query.page)  || 1;
    const skip  = (page - 1) * limit;

    const shots = await Screenshot
      .find({})
      .select("employeeId empId employeeName department role app windowTitle blockedApp time date productivity isBlocked createdAt updatedAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    console.log(`✅ GET /live — ${shots.length} screenshots (metadata only)`);
    res.json(shots);
  } catch (err) {
    console.error("Screenshot GET /live error:", err.message, "\n", err.stack);
    res.status(500).json({ error: err.message, detail: err.stack });
  }
});

// ✅ GET BY EMPLOYEE — images ke sath (modal open hone par call hoga)
router.get("/employee/:employeeId", async (req, res) => {
  try {
    const { employeeId } = req.params;
    const limit = parseInt(req.query.limit) || 100;

    const shots = await Screenshot
      .find({
        $or: [
          { employeeId: employeeId },
          { empId:      employeeId },
        ]
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    console.log(`✅ GET /employee/${employeeId} — ${shots.length} shots with images`);
    res.json(shots);
  } catch (err) {
    console.error("Screenshot GET by employee error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ GET SINGLE WITH IMAGE
router.get("/:id/image", async (req, res) => {
  try {
    const shot = await Screenshot
      .findById(req.params.id)
      .select("imageUrl employeeId employeeName app windowTitle productivity isBlocked time date")
      .lean();
    if (!shot) return res.status(404).json({ error: "Not found" });
    res.json(shot);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ✅ DELETE OLD — /old/all PEHLE hona chahiye /:id se (order matters!)
router.delete("/old/all", protect, async (req, res) => {
  try {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const result = await Screenshot.deleteMany({ createdAt: { $lt: yesterday } });
    console.log(`🗑️ Deleted ${result.deletedCount} old screenshots`);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("Screenshot DELETE old error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ✅ DELETE ONE
router.delete("/:id", protect, async (req, res) => {
  try {
    await Screenshot.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Screenshot DELETE error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;