const { monitorSignals, getNextInterval } = require("../services/monitor.service");

// ─────────────────────────────────────────────────────────────────
//  منتور متكيّف — يغير سرعته تلقائياً حسب خطورة الإشارات
//
//  لا توجد إشارات    → كل 2 دقيقة   (توفير كامل)
//  إشارات تنتظر      → كل 90 ثانية  (WAITING)
//  إشارات مفعَّلة    → كل 30 ثانية  (ACTIVE)
//  إشارة قرب SL/TP   → كل 10 ثواني  (URGENT)
// ─────────────────────────────────────────────────────────────────

let isRunning  = false;
let nextTimer  = null;

async function runCycle() {
  // منع التشغيل المتزامن
  if (isRunning) {
    console.log("⏭️  Monitor: busy, rescheduling...");
    schedule();
    return;
  }

  isRunning = true;
  try {
    await monitorSignals();
  } catch (err) {
    console.error("❌ Monitor error:", err.message);
  } finally {
    isRunning = false;
    schedule(); // جدول الدورة التالية بعد انتهاء هذه
  }
}

async function schedule() {
  if (nextTimer) clearTimeout(nextTimer);

  try {
    const ms    = await getNextInterval();
    const label = ms === 10_000  ? "URGENT  (10s)"
                : ms === 30_000  ? "ACTIVE  (30s)"
                : ms === 90_000  ? "WAITING (90s)"
                :                  "IDLE    (2m)";

    console.log(`⏱️  Monitor next: ${label}`);
    nextTimer = setTimeout(runCycle, ms);
  } catch (err) {
    console.error("Monitor schedule error:", err.message);
    nextTimer = setTimeout(runCycle, 30_000); // fallback
  }
}

function startMonitor() {
  console.log("👀 Adaptive monitor started");
  setTimeout(runCycle, 5_000); // أول دورة بعد 5 ثواني من البدء
}

module.exports = { startMonitor };
