import Screenshot from "../models/Screenshot.js";

export const uploadScreenshot = async (req, res) => {
  const fileUrl = req.file?.path;

  const ss = await Screenshot.create({
    userId: req.user._id,
    imageUrl: fileUrl,
  });

  res.json(ss);
};