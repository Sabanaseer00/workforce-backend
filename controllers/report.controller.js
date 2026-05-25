import Activity from "../models/Activity.js";
import Screenshot from "../models/Screenshot.js";

export const getReport = async (req, res) => {
  const activities = await Activity.find();
  const screenshots = await Screenshot.find();

  res.json({
    activities,
    screenshots,
  });
};