const binance      = require("./binance.service");
const ai           = require("./ai.service");
const telegram     = require("./telegram.service");
const Signal       = require("../models/Signal");
const symbols      = require("../utils/symbols");
const limiter      = require("../utils/dailyLimiter");
const { calculateSignalScore } = require("./scoring.service");

// ─────────────────────────────────────────────
// 1. تحديد الاتجاه من الـ 4h و 1h
// ─────────────────────────────────────────────
function detectDirection(htf, mtf) {
  const htfBullish = htf.currentClose > htf.ema200;
  const htfBearish = htf.currentClose < htf.ema200;

  // MTF: يكفي السعر فوق/تحت EMA50 — أزلنا شرط RSI لأنه كان يرفض اتجاهات صحيحة
  const mtfBullish = mtf.currentClose > mtf.ema50;
  const mtfBearish = mtf.currentClose < mtf.ema50;

  if (htfBullish && mtfBullish) return "LONG";
  if (htfBearish && mtfBearish) return "SHORT";
  return null;
}

// ─────────────────────────────────────────────
// 2. فلتر الدخول على الـ 15m
//
//  المشاكل القديمة التي أصلحناها:
//  - nearEma: 0.8% كان ضيقاً جداً  → وسّعنا إلى 2.5%
//  - volumeSurge: شرط إلزامي صعب   → أصبح اختيارياً (يؤثر على Score فقط)
//  - isBearishBar: كان يرفض كاندلز محايدة → أزلنا الشرط
//  - شرط RSI في detectDirection     → أزلناه
// ─────────────────────────────────────────────
function passesEntryFilter(ltf, direction) {
  const {
    currentClose, ema21, ema50, ema200, rsi,
    macdMomentumUp, macdMomentumDown,
    macdBullishCross, macdBearishCross,
    volumeSurge, atr,
  } = ltf;

  if (!ema21 || !ema50 || !ema200 || !rsi || !atr) return false;

  // السعر في نطاق معقول من EMA21 أو EMA50
  // وسّعنا من 0.8% إلى 2.5% لأن الـ 15m يتذبذب أكثر
  const nearEma21  = Math.abs(currentClose - ema21) / currentClose < 0.025;
  const nearEma50  = Math.abs(currentClose - ema50) / currentClose < 0.030;
  const inPullback = nearEma21 || nearEma50;

  if (!inPullback) return false;

  // RSI ليس في منطقة متطرفة
  if (rsi < 28 || rsi > 78) return false;

  if (direction === "LONG") {
    // السعر فوق EMA200 على الـ 15m — اتجاه كلي صاعد
    if (currentClose < ema200 * 0.99) return false;

    // رفض فقط إذا MACD هابط بقوة مع عدم وجود أي إشارة إيجابية
    if (macdMomentumDown && !macdBullishCross && !volumeSurge) return false;

    return true;
  }

  if (direction === "SHORT") {
    // السعر تحت EMA200 على الـ 15m
    if (currentClose > ema200 * 1.01) return false;

    // رفض فقط إذا MACD صاعد بقوة مع عدم وجود أي إشارة سلبية
    if (macdMomentumUp && !macdBearishCross && !volumeSurge) return false;

    return true;
  }

  return false;
}

// ─────────────────────────────────────────────
// 3. حساب SL و Targets من ATR
//    RR: TP1=1:1.5 | TP2=1:2.5 | TP3=1:4
// ─────────────────────────────────────────────
function buildLevels(direction, currentClose, atr, ltf) {
  const slMultiplier = 1.8;
  const entry = currentClose;

  const entryMin = parseFloat((entry * 0.9985).toFixed(6));
  const entryMax = parseFloat((entry * 1.0015).toFixed(6));

  if (direction === "LONG") {
    const slBase   = Math.min(ltf.low, entry - atr * slMultiplier);
    const stopLoss = parseFloat(slBase.toFixed(6));
    const risk     = entry - stopLoss;
    return {
      entryMin, entryMax, stopLoss,
      targets: [
        parseFloat((entry + risk * 1.5).toFixed(6)),
        parseFloat((entry + risk * 2.5).toFixed(6)),
        parseFloat((entry + risk * 4.0).toFixed(6)),
      ],
    };
  }

  const slBase   = Math.max(ltf.high, entry + atr * slMultiplier);
  const stopLoss = parseFloat(slBase.toFixed(6));
  const risk     = stopLoss - entry;
  return {
    entryMin, entryMax, stopLoss,
    targets: [
      parseFloat((entry - risk * 1.5).toFixed(6)),
      parseFloat((entry - risk * 2.5).toFixed(6)),
      parseFloat((entry - risk * 4.0).toFixed(6)),
    ],
  };
}

// ─────────────────────────────────────────────
// 4. الدالة الرئيسية للمسح
// ─────────────────────────────────────────────
async function scanMarket(limit = 3, sessionKey = null) {
  console.log("🔎 Starting multi-timeframe scan...");

  if (sessionKey && !limiter.canSend(sessionKey)) {
    console.log(`⏭️  Daily limit reached for session: ${sessionKey}`);
    return 0;
  }

  const candidates = [];

  for (const symbol of symbols) {
    try {
      const existing = await Signal.findOne({
        symbol,
        status: { $in: ["SENT", "ENTRY_HIT", "TP1_HIT", "TP2_HIT"] },
      });
      if (existing) {
        console.log(`⏭️  ${symbol}: open signal exists, skipping`);
        continue;
      }

      const mtfData = await binance.getMultiTimeframeData(symbol);
      if (!mtfData) {
        console.log(`⚠️  ${symbol}: insufficient data`);
        continue;
      }

      const { htf, mtf, ltf } = mtfData;

      // الخطوة 1: تحديد الاتجاه
      const direction = detectDirection(htf, mtf);
      if (!direction) {
        console.log(`🚫 ${symbol}: no clear trend`);
        continue;
      }

      // الخطوة 2: فلتر الدخول
      if (!passesEntryFilter(ltf, direction)) {
        console.log(`🚫 ${symbol}: entry filter failed (direction=${direction})`);
        continue;
      }

      // الخطوة 3: حساب المستويات
      const levels = buildLevels(direction, ltf.currentClose, ltf.atr, ltf);
      const risk   = Math.abs(ltf.currentClose - levels.stopLoss);
      const rr     = risk > 0
        ? Math.abs(levels.targets[0] - ltf.currentClose) / risk
        : 0;

      if (rr < 1.3) {
        console.log(`🚫 ${symbol}: poor RR=${rr.toFixed(2)}`);
        continue;
      }

      // الخطوة 4: GPT يصادق
      const validation = await ai.validateSetup({ symbol, direction, ltf, mtf, htf });

      if (!validation.approved) {
        console.log(`❌ ${symbol}: GPT rejected — ${validation.reason}`);
        continue;
      }

      if (validation.confidence < 60) {
        console.log(`❌ ${symbol}: GPT low confidence=${validation.confidence}`);
        continue;
      }

      const { score } = calculateSignalScore(
        { direction, ...levels, confidence: validation.confidence },
        ltf
      );

      candidates.push({
        symbol, direction, ltf, levels, rr, score,
        confidence: validation.confidence,
        summary:    validation.reason,
      });

      console.log(`✅ ${symbol} | dir=${direction} | score=${score} | RR=${rr.toFixed(2)} | conf=${validation.confidence}`);

    } catch (err) {
      console.log(`scan error [${symbol}]: ${err.message}`);
    }
  }

  if (!candidates.length) {
    console.log("📭 No valid setups found this scan");
    return 0;
  }

  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, limit);
  let sentCount = 0;

  for (const item of top) {
    try {
      const existing = await Signal.findOne({
        symbol: item.symbol,
        status: { $in: ["SENT", "ENTRY_HIT", "TP1_HIT", "TP2_HIT"] },
      });
      if (existing) continue;

      const newSignal = await Signal.create({
        symbol:           item.symbol,
        timeframe:        "15m",
        direction:        item.direction,
        entryMin:         item.levels.entryMin,
        entryMax:         item.levels.entryMax,
        stopLoss:         item.levels.stopLoss,
        targets:          item.levels.targets,
        confidence:       item.confidence,
        summary:          item.summary,
        score:            item.score,
        rr:               parseFloat(item.rr.toFixed(2)),
        status:           "SENT",
        currentPrice:     item.ltf.currentClose,
        atrAtEntry:       item.ltf.atr,
        originalStopLoss: item.levels.stopLoss,
      });

      const sent = await telegram.sendSignal(newSignal.toObject());
      if (sent) {
        newSignal.telegramMessageId = sent.message_id;
        newSignal.telegramChatId    = String(sent.chat.id);
        await newSignal.save();
      }

      sentCount++;
      console.log(`🚨 SIGNAL SENT: ${item.symbol} | ${item.direction} | score=${item.score}`);
    } catch (err) {
      console.log(`send error [${item.symbol}]: ${err.message}`);
    }
  }

  if (sessionKey && sentCount > 0) limiter.markSent(sessionKey);

  return sentCount;
}

module.exports = { scanMarket };
