const mongoose = require("mongoose");

const SignalSchema = new mongoose.Schema(
  {
    symbol:    { type: String, required: true },
    timeframe: { type: String, default: "15m" },

    direction: { type: String, default: "NONE" },

    entryMin:  { type: Number, default: null },
    entryMax:  { type: Number, default: null },
    stopLoss:  { type: Number, default: null },
    targets:   { type: [Number], default: [] },

    // الـ SL الأصلي (قبل الـ trailing) — للمرجعية
    originalStopLoss: { type: Number, default: null },

    // ATR وقت إنشاء الإشارة — للتحليل اللاحق
    atrAtEntry: { type: Number, default: null },

    confidence: { type: Number, default: 0 },
    summary:    { type: String, default: "" },

    score: { type: Number, default: null },
    rr:    { type: Number, default: null },

    status: {
      type:    String,
      default: "NEW",
      // NEW → SENT → ENTRY_HIT → TP1_HIT → TP2_HIT → CLOSED / STOPPED / EXPIRED
    },

    entryAlertSent: { type: Boolean, default: false },
    tp1Hit:         { type: Boolean, default: false },
    tp2Hit:         { type: Boolean, default: false },
    tp3Hit:         { type: Boolean, default: false },
    stopLossHit:    { type: Boolean, default: false },

    // هل الـ Trailing Stop مفعّل؟ (يتفعل بعد TP1)
    trailingActive: { type: Boolean, default: false },

    currentPrice: { type: Number, default: null },

    // Telegram
    telegramMessageId: { type: Number, default: null },
    telegramChatId:    { type: String, default: null },

    // Timestamps للأحداث
    entryHitAt:   { type: Date, default: null },
    tp1HitAt:     { type: Date, default: null },
    tp2HitAt:     { type: Date, default: null },
    tp3HitAt:     { type: Date, default: null },
    stopLossHitAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Indexes للاستعلامات المتكررة في المراقبة
SignalSchema.index({ symbol: 1, status: 1 });
SignalSchema.index({ status: 1 });
SignalSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Signal", SignalSchema);
