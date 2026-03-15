/**
 * نظام تسجيل النقاط للإشارات.
 * كل معيار يُعطي نقاطاً، الإشارات ذات النقاط الأعلى تُرسَل أولاً.
 */

function calculateRR(signal) {
  if (!signal?.targets?.length || signal.entryMax == null || signal.stopLoss == null) {
    return 0;
  }
  const entry  = (signal.entryMin + signal.entryMax) / 2; // منتصف النطاق
  const risk   = Math.abs(entry - signal.stopLoss);
  const reward = Math.abs(signal.targets[0] - entry);
  return risk > 0 ? reward / risk : 0;
}

function calculateSignalScore(signal, ltf) {
  let score = 0;

  const { currentClose, ema50, ema200, rsi,
          macdMomentumUp, macdMomentumDown,
          macdBullishCross, macdBearishCross,
          volumeSurge, volumeBuildup,
          isBullishBar, isBearishBar } = ltf;

  const dir = signal.direction;

  // ── اتجاه السعر مقارنة بـ EMA200 (أهم معيار) ─── 25 نقطة
  if (dir === "LONG"  && currentClose > ema200) score += 25;
  if (dir === "SHORT" && currentClose < ema200) score += 25;

  // ── EMA50 alignment ──────────────────────────── 15 نقطة
  if (dir === "LONG"  && currentClose > ema50) score += 15;
  if (dir === "SHORT" && currentClose < ema50) score += 15;

  // ── RSI في المنطقة المثالية ──────────────────── 15 نقطة
  if (dir === "LONG"  && rsi >= 45 && rsi <= 62) score += 15;
  if (dir === "SHORT" && rsi >= 38 && rsi <= 55) score += 15;

  // ── MACD تأكيد ────────────────────────────────── 15 نقطة
  if (dir === "LONG") {
    if (macdBullishCross) score += 15;
    else if (macdMomentumUp) score += 8;
  }
  if (dir === "SHORT") {
    if (macdBearishCross) score += 15;
    else if (macdMomentumDown) score += 8;
  }

  // ── Volume ────────────────────────────────────── 10 نقطة
  if (volumeSurge)   score += 10;
  else if (volumeBuildup) score += 6;

  // ── Candle تأكيد ─────────────────────────────── 10 نقطة
  if (dir === "LONG"  && isBullishBar) score += 10;
  if (dir === "SHORT" && isBearishBar) score += 10;

  // ── GPT confidence ───────────────────────────── 10 نقطة
  if      (signal.confidence >= 85) score += 10;
  else if (signal.confidence >= 70) score += 7;
  else if (signal.confidence >= 60) score += 4;

  // ── Risk/Reward ratio ─────────────────────────── 10 نقطة
  const rr = calculateRR(signal);
  if      (rr >= 3.0) score += 10;
  else if (rr >= 2.0) score += 7;
  else if (rr >= 1.5) score += 4;

  return { score, rr };
}

module.exports = { calculateSignalScore };
