const scanner = require("./scanner.service");
const telegram = require("./telegram.service");
const Signal = require("../models/Signal");

let manualScanRunning = false;

function startTelegramBot() {
  telegram.bot.on("message", async (msg) => {
    try {
      const chatId = String(msg.chat.id);
      const allowedChatId = String(process.env.TELEGRAM_CHAT_ID);
      const text = (msg.text || "").trim();

      if (chatId !== allowedChatId) return;

      if (text === "/start") {
        await telegram.sendMainMenu();
        return;
      }

      if (text === "📡 فحص السوق الآن") {
        if (manualScanRunning) {
          await telegram.bot.sendMessage(chatId, "⏳ يوجد فحص شغال الآن، انتظر.");
          return;
        }

        manualScanRunning = true;

        await telegram.bot.sendMessage(chatId, "🟢 v2 جاري فحص السوق الآن...");

        try {
          const sentCount = await scanner.scanMarket(3);

          if (!sentCount) {
            await telegram.bot.sendMessage(chatId, "🟢 v2 لا توجد توصيات مناسبة حاليًا.");
          } else {
            await telegram.bot.sendMessage(chatId, `🟢 v2 تم إرسال ${sentCount} توصية.`);
          }
        } catch (err) {
          console.log("manual scan error:", err.message);
          await telegram.bot.sendMessage(chatId, "❌ حدث خطأ أثناء فحص السوق.");
        } finally {
          manualScanRunning = false;
        }

        return;
      }

      if (text === "📊 الصفقات المفتوحة") {
        const signals = await Signal.find({
          status: { $in: ["SENT", "ENTRY_HIT", "TP1_HIT", "TP2_HIT"] }
        }).sort({ createdAt: -1 });

        if (!signals.length) {
          await telegram.bot.sendMessage(chatId, "🟢 v2 لا توجد صفقات مفتوحة.");
          return;
        }

        for (const s of signals) {
          const message = telegram.buildSignalMessage(s);
          await telegram.bot.sendMessage(chatId, message, {
            parse_mode: "HTML"
          });
        }

        return;
      }
    } catch (err) {
      manualScanRunning = false;
      console.log("telegram bot error:", err.message);
    }
  });
}

module.exports = {
  startTelegramBot
};