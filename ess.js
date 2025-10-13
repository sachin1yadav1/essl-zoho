/**
 * getDeviceLogs.js — eTimeTrackLite Read-Only Logs API
 * -------------------------------------------------------
 * Reads from current month table (DeviceLogs_MM_YYYY)
 * Joins with dbo.Devices and dbo.Employees
 * Returns: Device + Employee info
 *
 * Run:
 *   npm install express mssql
 *   node getDeviceLogs.js
 */

import express from "express";
import sql from "mssql";

const app = express();

// ==================== DATABASE CONFIG ====================
const dbConfig = {
  user: "sa",
  password: "Ind!@nta1ent",
  server: "ACCESS-01",
  database: "eTimetracklite1",
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};

// ==================== HELPER: DYNAMIC TABLE NAME ====================
function getCurrentTable(month, year) {
  const now = new Date();
  const m = month ? parseInt(month) : now.getMonth() + 1;
  const y = year ? parseInt(year) : now.getFullYear();
  return `DeviceLogs_${m}_${y}`;
}

// ==================== READ LOGS (JOINED) ====================
app.get("/api/getDeviceLogs", async (req, res) => {
  const { month, year } = req.query;
  const tableName = getCurrentTable(month, year);

  try {
    const pool = await sql.connect(dbConfig);
    const request = pool.request();

    console.log(`📊 Reading data from: ${tableName} (joined with Devices & Employees)`);

    const query = `
      SELECT TOP 1000
        L.DeviceId,
        D.DeviceSName AS DeviceName,
        L.DownloadDate,
        L.UserId,
        E.EmployeeCode,
        E.EmployeeName,
        L.LogDate,
        L.CreatedDate,
        L.Direction,
        L.IsApproved
      FROM ${tableName} AS L
      LEFT JOIN Devices AS D ON L.DeviceId = D.DeviceId
      LEFT JOIN Employees AS E ON L.UserId = E.EmployeeCodeInDevice
      ORDER BY L.LogDate DESC;
    `;

    const result = await request.query(query);

    res.json({
      success: true,
      table: tableName,
      total: result.recordset.length,
      data: result.recordset,
    });
  } catch (err) {
    console.error("❌ SQL Query Error:", err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ==================== ROOT PAGE ====================
app.get("/", (req, res) => {
  const table = getCurrentTable();
  res.send(`
    <h2>✅ eTimeTrackLite Read-Only Logs API (with Employee & Device)</h2>
    <p>Reading from: <b>${table}</b></p>
    <ul>
      <li><a href="/api/getDeviceLogs">GET /api/getDeviceLogs</a> — view logs</li>
      <li>Optional: /api/getDeviceLogs?month=9&year=2025 → older data</li>
    </ul>
  `);
});

// ==================== START SERVER ====================
const PORT = 4000;
app.listen(PORT, () =>
  console.log(`🚀 Read-Only API running on http://localhost:${PORT}`)
);
