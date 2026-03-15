const Signal   = require("../models/Signal");
const binance  = require("./binance.service");
const telegram = require("./telegram.service");

// ─────────────────────────────────────────────
//  إشارة SENT تنتهي بعد 8 ساعات بدون دخول
// ─────────────────────────────────────────────
const EXPIRY_HOURS = 8;

function isExpired(signal) {
  if (signal.status !== "SENT") return false;
  const ageMs = Date.now() - new Date(signal.createdAt).getTime();
  return ageMs > EXPIRY_HOURS * 3_600_000;
}

// ─────────────────────────────────────────────
//  جلب أسعار جميع الرموز دفعة وحدة
//  بدل طلب منفصل لكل رمز
// ─────────────────────────────────────────────
async function fetchPrices(symbols) {
  const prices = {};
  await Promise.allSettled(
    [...new Set(symbols)].map(async (sym) => {
      try {
        const candles = await binance.getKlines(sym, "1m", 2);
        const last    = candles[candles.length - 1];
        prices[sym]   = {
          high:  Number(last.high),
          low:   Number(last.low),
          close: Number(last.close),
        };
      } catch {
        prices[sym] = null;
      }
    })
  );
  return prices;
}

// ─────────────────────────────────────────────
//  يحسب الـ interval التالي بناءً على الإشارات
//  المفتوحة وأولويتها — يُستدعى من monitor.job
// ─────────────────────────────────────────────
async function getNextInterval() {
  const signals = await Signal.find({
    status: { $in: ["SENT", "ENTRY_HIT", "TP1_HIT", "TP2_HIT"] },
  }).select("status direction currentPrice stopLoss entryMin entryMax targets tp1Hit tp2Hit tp3Hit");

  // لا توجد إشارات → تحقق كل دقيقتين فقط
  if (!signals.length) return 120_000;

  let highestPriority = "WAITING";

  for (const s of signals) {
    if (s.status === "SENT") continue; // WAITING بالفعل

    const price = s.currentPrice;
    if (!price) { highestPriority = "ACTIVE"; continue; }

    const slDist = Math.abs(price - s.stopLoss) / price * 100;

    let nextTP = null;
    if (!s.tp1Hit) nextTP = s.targets[0];
    else if (!s.tp2Hit) nextTP = s.targets[1];
    else if (!s.tp3Hit) nextTP = s.targets[2];

    const tpDist = nextTP ? Math.abs(price - nextTP) / price * 100 : 999;

    // URGENT: السعر على بُعد أقل من 0.3% من SL أو TP
    if (slDist < 0.3 || tpDist < 0.3) return 10_000; // عد فوراً بدون فحص الباقي

    // URGENT: السعر يسير نحو SL بقوة
    const isLong = s.direction === "LONG";
    if (isLong  && price < s.entryMax && slDist < 0.8) return 10_000;
    if (!isLong && price > s.entryMin && slDist < 0.8) return 10_000;

    highestPriority = "ACTIVE";
  }

  if (highestPriority === "ACTIVE")  return 30_000;
  return 90_000; // كلها WAITING
}

// ─────────────────────────────────────────────
//  معالجة إشارة SENT
// ─────────────────────────────────────────────
async function handleSentSignal(signal, candle) {
  if (isExpired(signal)) {
    signal.status = "EXPIRED";
    await signal.save();
    await telegram.sendMessage(
      `⌛ إشارة <b>${signal.symbol}</b> انتهت صلاحيتها بدون دخول (${EXPIRY_HOURS}h)`,
      { parse_mode: "HTML" }
    );
    console.log(`⌛ EXPIRED: ${signal.symbol}`);
    return;
  }

  const touched = candle.low <= signal.entryMax && candle.high >= signal.entryMin;
  if (touched) {
    signal.entryAlertSent = true;
    signal.status         = "ENTRY_HIT";
    signal.entryHitAt     = new Date();
    signal.trailingActive = false;
    signal.currentPrice   = candle.close;
    await signal.save();
    await telegram.sendEntryAlert(signal, candle.close);
    console.log(`📡 ENTRY HIT: ${signal.symbol} @ ${candle.close}`);
  }
}

// ─────────────────────────────────────────────
//  معالجة إشارة مفعَّلة
// ─────────────────────────────────────────────
async function handleActiveSignal(signal, candle) {
  const isLong        = signal.direction === "LONG";
  signal.currentPrice = candle.close;

  // ── SL أولاً دائماً ───────────────────────
  const slHit = isLong
    ? candle.low  <= signal.stopLoss
    : candle.high >= signal.stopLoss;

  if (slHit) {
    signal.stopLossHit   = true;
    signal.status        = "STOPPED";
    signal.stopLossHitAt = new Date();
    await signal.save();
    await telegram.sendStopLossAlert(signal, candle.close);
    console.log(`❌ SL: ${signal.symbol} @ ${candle.close}`);
    return;
  }

  // ── TP1 ───────────────────────────────────
  if (!signal.tp1Hit) {
    const hit = isLong
      ? candle.high >= signal.targets[0]
      : candle.low  <= signal.targets[0];
    if (hit) {
      signal.tp1Hit         = true;
      signal.status         = "TP1_HIT";
      signal.tp1HitAt       = new Date();
      signal.stopLoss       = signal.entryMax; // breakeven
      signal.trailingActive = true;
      await signal.save();
      await telegram.sendTp1Alert(signal, candle.close);
      console.log(`🎯 TP1: ${signal.symbol} | SL → ${signal.stopLoss}`);
      return;
    }
  }

  // ── TP2 ───────────────────────────────────
  if (signal.tp1Hit && !signal.tp2Hit) {
    const hit = isLong
      ? candle.high >= signal.targets[1]
      : candle.low  <= signal.targets[1];
    if (hit) {
      signal.tp2Hit   = true;
      signal.status   = "TP2_HIT";
      signal.tp2HitAt = new Date();
      signal.stopLoss = signal.targets[0]; // SL → TP1
      await signal.save();
      await telegram.sendTp2Alert(signal, candle.close);
      console.log(`🚀 TP2: ${signal.symbol} | SL → ${signal.stopLoss}`);
      return;
    }
  }

  // ── TP3 ───────────────────────────────────
  if (signal.tp2Hit && !signal.tp3Hit) {
    const hit = isLong
      ? candle.high >= signal.targets[2]
      : candle.low  <= signal.targets[2];
    if (hit) {
      signal.tp3Hit   = true;
      signal.status   = "CLOSED";
      signal.tp3HitAt = new Date();
      await signal.save();
      await telegram.sendTp3Alert(signal, candle.close);
      console.log(`🏁 CLOSED: ${signal.symbol}`);
      return;
    }
  }

  await signal.save();
}

// ─────────────────────────────────────────────
//  الدالة الرئيسية
// ─────────────────────────────────────────────
async function monitorSignals() {
  const signals = await Signal.find({
    status: { $in: ["SENT", "ENTRY_HIT", "TP1_HIT", "TP2_HIT"] },
  });

  if (!signals.length) return;

  console.log(`👀 Monitoring ${signals.length} signal(s)...`);

  // جلب الأسعار دفعة وحدة
  const prices = await fetchPrices(signals.map(s => s.symbol));

  for (const signal of signals) {
    try {
      const candle = prices[signal.symbol];
      if (!candle) {
        console.log(`⚠️  No price for ${signal.symbol}`);
        continue;
      }

      console.log(
        `🔍 ${signal.symbol} | ${signal.status} | ` +
        `close=${candle.close} | SL=${signal.stopLoss}`
      );

      if (signal.status === "SENT") {
        await handleSentSignal(signal, candle);
      } else {
        await handleActiveSignal(signal, candle);
      }
    } catch (err) {
      console.error(`monitor error [${signal.symbol}]: ${err.message}`);
    }
  }
}

module.exports = { monitorSignals, getNextInterval };
