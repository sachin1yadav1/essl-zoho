import { Router } from "express";
import { readDeviceLogs, pushLogsToZoho, syncRecentLogs } from "../services/zohoSync.js";

const router = Router();

router.get("/device-logs", async (req, res) => {
  const { month, year, limit, since } = req.query;
  try {
    const out = await readDeviceLogs(limit ? parseInt(limit) : 1000, since || null, month || null, year || null);
    res.json({ success: true, ...out });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/push-logs", async (req, res) => {
  const logs = Array.isArray(req.body) ? req.body : req.body?.data || [];
  if (!Array.isArray(logs) || logs.length === 0) {
    return res.status(400).json({ success: false, error: "No logs provided" });
  }
  try {
    const out = await pushLogsToZoho(logs);
    res.json({ success: true, pushed: out.length, details: out });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post("/sync-recent", async (req, res) => {
  const minutes = req.body?.minutesBack ? parseInt(req.body.minutesBack) : 5;
  try {
    const out = await syncRecentLogs(minutes);
    res.json({ success: true, ...out });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;