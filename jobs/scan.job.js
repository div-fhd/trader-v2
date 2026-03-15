const cron    = require("node-cron");
const scanner = require("../services/scanner.service");

function startScanner() {

  // ── مسح 1: 9:30 صباحاً (UTC+3 = 06:30 UTC)
  cron.schedule("30 6 * * *", async () => {
    console.log("🌅 Scan 1 — Morning (London open)");
    await scanner.scanMarket(2, "morning");
  }, { timezone: "UTC" });

  // ── مسح 2: 1:30 ظهراً (UTC+3 = 10:30 UTC)
  cron.schedule("30 10 * * *", async () => {
    console.log("🌞 Scan 2 — Midday (London mid-session)");
    await scanner.scanMarket(2, "midday");
  }, { timezone: "UTC" });

  // ── مسح 3: 4:30 عصراً (UTC+3 = 13:30 UTC) ← الأقوى
  cron.schedule("30 13 * * *", async () => {
    console.log("🌆 Scan 3 — Pre-NY (strongest session)");
    await scanner.scanMarket(2, "pre_ny");
  }, { timezone: "UTC" });

  // ── مسح 4: 7:30 مساءً (UTC+3 = 16:30 UTC) ← اختياري
  // فعّله فقط إذا أردت تغطية جلسة نيويورك
  cron.schedule("30 16 * * *", async () => {
    console.log("🌃 Scan 4 — NY session (optional)");
    await scanner.scanMarket(1, "ny");
  }, { timezone: "UTC" });

}

module.exports = { startScanner };