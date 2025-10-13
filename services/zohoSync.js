// Top-of-file additions
import { getPool, sql } from "../config/db.js";
import dayjs from "dayjs";
import { zohoClient } from "./zohoAuth.js";

function getCurrentTable(month, year) {
  const now = new Date();
  const m = month ? parseInt(month) : now.getMonth() + 1;
  const y = year ? parseInt(year) : now.getFullYear();
  return `DeviceLogs_${m}_${y}`;
}

export async function readDeviceLogs(limit = 1000, sinceISO = null, month = null, year = null) {
  const tableName = getCurrentTable(month, year);
  const pool = await getPool();
  const request = pool.request();

  let query = `
    SELECT TOP(${limit})
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
  `;

  if (sinceISO) {
    query += ` WHERE L.LogDate > @since`;
    request.input("since", sql.DateTime, new Date(sinceISO));
  }

  query += ` ORDER BY L.LogDate DESC;`;

  const result = await request.query(query);
  return { table: tableName, total: result.recordset.length, data: result.recordset };
}

async function findZohoEmployeeId(code) {
  const client = zohoClient();
  const url = `${process.env.ZOHO_EMPLOYEE_API_URL}`;
  const tryFields = ["EmployeeID", "EmployeeCode", "Employee_Code", "EMPLOYEEID", "EMPLOYEECODE"]; 

  for (const field of tryFields) {
    const params = { searchColumn: field, searchValue: code };
    try {
      const res = await client.get(url, { params });
      if (res.data && res.data.data && res.data.data.length > 0) {
        const rec = res.data.data[0];
        const values = rec.values || rec;
        const employeeId = values.EmployeeID || values.EmployeeId || values.id || rec.EmployeeID || rec.id;
        if (employeeId) return employeeId;
      }
    } catch (e) {}
  }
  return null;
}

function mapLogToAttendance(log) {
  const dt = dayjs(log.LogDate);
  const direction = (log.Direction || "").toLowerCase() === "out" ? "out" : "in";
  return {
    employeeId: log.EmployeeCode || log.UserId,
    date: dt.format("YYYY-MM-DD"),
    time: dt.format("HH:mm:ss"),
    direction,
    deviceId: String(log.DeviceId),
    deviceName: log.DeviceName || "",
  };
}

async function postAttendance(att) {
  const client = zohoClient();
  const url = process.env.ZOHO_ATTENDANCE_API_URL;

  const payload1 = {
    data: [
      {
        employeeId: att.employeeId,
        date: att.date,
        time: att.time,
        direction: att.direction,
        source: "ESSL",
        deviceId: att.deviceId,
        deviceName: att.deviceName,
      },
    ],
  };

  try {
    const res = await client.post(url, payload1);
    return { ok: true, response: res.data };
  } catch (e1) {
    const payload2 = {
      employeeId: att.employeeId,
      date: att.date,
      checkin: att.direction === "in" ? att.time : undefined,
      checkout: att.direction === "out" ? att.time : undefined,
      deviceId: att.deviceId,
    };
    try {
      const res2 = await client.post(url, payload2);
      return { ok: true, response: res2.data };
    } catch (e2) {
      return { ok: false, error: e2.response?.data || e2.message };
    }
  }
}

export async function pushLogsToZoho(logs) {
  const delayMs = parseInt(process.env.ZOHO_RATE_LIMIT_DELAY || "100", 10);
  const results = [];
  for (const log of logs) {
    const att = mapLogToAttendance(log);

    // Prefer MSSQL UserId as the local mapping key
    const mapKey = String(log.UserId);
    const mappedId = resolveEmployeeId(mapKey);

    // Fall back to Zoho People search using the attendance employeeId
    const zohoId = mappedId ? mappedId : await findZohoEmployeeId(att.employeeId);
    const finalEmpId = zohoId || att.employeeId;

    const entry = { ...att, employeeId: finalEmpId };
    const res = await postAttendance(entry);
    results.push({ att: entry, result: res });
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return results;
}

export async function syncRecentLogs(minutesBack = 5) {
  const since = dayjs().subtract(minutesBack, "minute").toISOString();
  const { data } = await readDeviceLogs(500, since);
  const pushed = await pushLogsToZoho(data);
  const okCount = pushed.filter((p) => p.result.ok).length;
  return { totalFetched: data.length, totalPushed: okCount, details: pushed };
}

import fs from "fs";
import path from "path";

let employeeMapCache = null;
function getEmployeeMap() {
  if (employeeMapCache) return employeeMapCache;
  try {
    const p = path.join(process.cwd(), "config", "employeeMap.json");
    const raw = fs.readFileSync(p, "utf-8");
    employeeMapCache = JSON.parse(raw);
  } catch (e) {
    employeeMapCache = {};
  }
  return employeeMapCache;
}

function resolveEmployeeId(esslCode) {
  const map = getEmployeeMap();
  return map[String(esslCode)] || null;
}