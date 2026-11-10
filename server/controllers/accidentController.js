import AccidentLog from "../models/AccidentLog.js";

export async function getAccidents(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
    const accidents = await AccidentLog.find()
      .sort({ timestamp: -1 })
      .limit(limit);

    return res.json({ accidents });
  } catch (error) {
    next(error);
  }
}

export async function clearAccidents(req, res, next) {
  try {
    await AccidentLog.deleteMany({});
    return res.json({ success: true, message: "Accident logs cleared" });
  } catch (error) {
    next(error);
  }
}

