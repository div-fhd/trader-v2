const TelegramBot = require("node-telegram-bot-api");

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ─────────────────────────────────────────────
//  BOT_VERSION من .env — يظهر في كل رسالة
//  القديم:  BOT_VERSION=v1-old
//  الجديد:  BOT_VERSION=v2-new
// ─────────────────────────────────────────────
const VERSION = process.env.BOT_VERSION || "unknown";

const VERSION_META = {
  "v1-old": { label: "v1 — Classic",  badge: "⚪" },
  "v2-new": { label: "v2 — Enhanced", badge: "🟢" },
};

function getVersionLine() {
  const meta = VERSION_META[VERSION];
  if (meta) return `${meta.badge} <b>${meta.label}</b>`;
  return `⚙️ <b>${VERSION}</b>`;
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatDateTime(dateValue) {
  if (!dateValue) return "—";
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone:  "Asia/Hebron",
    year:      "numeric",
    month:     "2-digit",
    day:       "2-digit",
    hour:      "2-digit",
    minute:    "2-digit",
    hour12:    false,
  });
}

function formatTarget(label, value, hit, hitAt) {
  const safe = escapeHtml(value);
  return hit
    ? `• <s>${label}: ${safe}</s> ✅ ${formatDateTime(hitAt)}`
    : `• ${label}: <b>${safe}</b>`;
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function calcPercent(from, to, direction) {
  const a = toNum(from);
  const b = toNum(to);
  if (!a || !b) return null;
  return direction === "LONG"
    ? ((b - a) / a) * 100
    : ((a - b) / a) * 100;
}

function formatPct(value) {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

// ─────────────────────────────────────────────
//  بناء رسالة الإشارة — مع tag النسخة في الأعلى
// ─────────────────────────────────────────────
function buildSignalMessage(signal) {
  const statusMap = {
    SENT:       "⏳ Waiting Entry",
    ENTRY_HIT:  "📡 Entry Hit",
    TP1_HIT:    "🎯 TP1 Hit",
    TP2_HIT:    "🚀 TP2 Hit",
    CLOSED:     "🏁 Closed",
    STOPPED:    "❌ Stopped",
    EXPIRED:    "⌛ Expired",
  };

  const statusText = statusMap[signal.status] || signal.status || "—";

  const entryRef = signal.direction === "LONG"
    ? signal.entryMax
    : signal.entryMin;

  const riskPct = calcPercent(entryRef, signal.stopLoss,      signal.direction);
  const tp1Pct  = calcPercent(entryRef, signal.targets?.[0],  signal.direction);
  const tp2Pct  = calcPercent(entryRef, signal.targets?.[1],  signal.direction);
  const tp3Pct  = calcPercent(entryRef, signal.targets?.[2],  signal.direction);

  // progress bar نصي
  const entry = signal.entryAlertSent ? "✅" : "⏳";
  const tp1   = signal.tp1Hit         ? "✅" : "⏳";
  const tp2   = signal.tp2Hit         ? "✅" : "⏳";
  const tp3   = signal.tp3Hit         ? "✅" : "⏳";
  const sl    = signal.stopLossHit    ? "❌" : "⏳";

  return `
🚨 <b> 🟢 v2FUTURES SIGNAL</b>
📌 <b>Status:</b> ${statusText}

🪙 <b>Coin:</b> ${escapeHtml(signal.symbol)}
📈 <b>Direction:</b> ${escapeHtml(signal.direction)}
🕒 <b>Created:</b> ${formatDateTime(signal.createdAt)}

💰 <b>Entry Zone:</b> <b>${escapeHtml(signal.entryMin)} — ${escapeHtml(signal.entryMax)}</b>
🛑 <b>Stop Loss:</b> <b>${escapeHtml(signal.stopLoss)}</b>
💵 <b>Current Price:</b> <b>${escapeHtml(signal.currentPrice ?? "N/A")}</b>

🎯 <b>Targets:</b>
${formatTarget("TP1", signal.targets?.[0], signal.tp1Hit, signal.tp1HitAt)}
${formatTarget("TP2", signal.targets?.[1], signal.tp2Hit, signal.tp2HitAt)}
${formatTarget("TP3", signal.targets?.[2], signal.tp3Hit, signal.tp3HitAt)}

📍 ENTRY ${entry} | TP1 ${tp1} | TP2 ${tp2} | TP3 ${tp3} | SL ${sl}

📊 <b>Confidence:</b> ${escapeHtml(signal.confidence)}%
🏆 <b>Score:</b> ${escapeHtml(signal.score ?? "N/A")}
⚖️ <b>RR:</b> ${signal.rr ? signal.rr.toFixed(2) : "N/A"}

📐 <b>Move %:</b>
• <b>Risk:</b> ${formatPct(riskPct)}
• <b>TP1:</b>  ${formatPct(tp1Pct)}
• <b>TP2:</b>  ${formatPct(tp2Pct)}
• <b>TP3:</b>  ${formatPct(tp3Pct)}

🧠 <b>Analysis:</b>
${escapeHtml(signal.summary)}

🕒 <b>Entry Hit:</b> ${formatDateTime(signal.entryHitAt)}
🕒 <b>TP1 Hit:</b>   ${formatDateTime(signal.tp1HitAt)}
🕒 <b>TP2 Hit:</b>   ${formatDateTime(signal.tp2HitAt)}
🕒 <b>TP3 Hit:</b>   ${formatDateTime(signal.tp3HitAt)}
🕒 <b>SL Hit:</b>    ${formatDateTime(signal.stopLossHitAt)}
`.trim();
}

// ─────────────────────────────────────────────
//  إرسال وتحديث الرسائل
// ─────────────────────────────────────────────
async function sendMessage(message, options = {}) {
  try {
    const result = await bot.sendMessage(
      process.env.TELEGRAM_CHAT_ID,
      message,
      { parse_mode: "HTML", ...options }
    );
    console.log("📬 Telegram message sent");
    return result;
  } catch (err) {
    console.log("❌ Telegram send error:", err.message);
    throw err;
  }
}

async function sendSignal(signal) {
  return sendMessage(buildSignalMessage(signal));
}

async function updateSignalMessage(signal) {
  if (!signal.telegramMessageId || !signal.telegramChatId) {
    console.log(`⚠️ Missing telegram info for ${signal.symbol}`);
    return null;
  }

  try {
    // احذف الرسالة القديمة
    await bot.deleteMessage(
      signal.telegramChatId,
      signal.telegramMessageId
    ).catch(() => {}); // تجاهل الخطأ إذا الرسالة انحذفت مسبقاً
  } catch {}

  // أرسل رسالة جديدة — هكذا يصلك إشعار
  const result = await sendMessage(buildSignalMessage(signal));

  // حدّث الـ ID في قاعدة البيانات
  if (result) {
    signal.telegramMessageId = result.message_id;
    signal.telegramChatId    = String(result.chat.id);
    await signal.save().catch(() => {});
  }

  return result;
}

async function sendEntryAlert(signal, price)    { signal.currentPrice = price; return updateSignalMessage(signal); }
async function sendTp1Alert(signal, price)      { signal.currentPrice = price; return updateSignalMessage(signal); }
async function sendTp2Alert(signal, price)      { signal.currentPrice = price; return updateSignalMessage(signal); }
async function sendTp3Alert(signal, price)      { signal.currentPrice = price; return updateSignalMessage(signal); }
async function sendStopLossAlert(signal, price) { signal.currentPrice = price; return updateSignalMessage(signal); }

async function sendMainMenu() {
  return bot.sendMessage(
    process.env.TELEGRAM_CHAT_ID,
    `\nتم تفعيل لوحة التحكم ✅`,
    {
      parse_mode: "HTML",
      reply_markup: {
        keyboard: [
          [{ text: "📡 فحص السوق الآن" }],
          [{ text: "📊 الصفقات المفتوحة" }],
        ],
        resize_keyboard: true,
      },
    }
  );
}

module.exports = {
  bot,
  sendSignal,
  updateSignalMessage,
  sendMessage,
  sendEntryAlert,
  sendTp1Alert,
  sendTp2Alert,
  sendTp3Alert,
  sendStopLossAlert,
  sendMainMenu,
  buildSignalMessage,
};
