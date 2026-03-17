const telegram = require("../services/telegram.service");

const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000; // كل ساعة

function startHeartbeat() {
  // إرسال فوري عند البدء
  sendHeartbeat();

  // ثم كل ساعة
  // setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

async function sendHeartbeat() {
  try {
    await telegram.sendMessage(
      `🤖 Bot Alive\n⏰ ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Hebron" })}`
    );
    console.log("💓 Heartbeat sent");
  } catch (err) {
    console.log("💔 Heartbeat error:", err.message);
  }
}

module.exports = { startHeartbeat };
