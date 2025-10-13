import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cron from "node-cron";
import syncRoutes from "./routes/syncRoutes.js";
import { syncRecentLogs } from "./services/zohoSync.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.send("ESSL → Zoho People sync service running.");
});

app.use("/api", syncRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});

const schedule = process.env.REALTIME_CRON || "*/1 * * * *";
cron.schedule(schedule, async () => {
  try {
    const lookback = parseInt(process.env.SYNC_LOOKBACK_MINUTES || "5", 10);
    const out = await syncRecentLogs(lookback);
    console.log(`🔄 Synced: fetched ${out.totalFetched}, pushed ${out.totalPushed}`);
  } catch (e) {
    console.error("❌ Sync job error:", e.message);
  }
});