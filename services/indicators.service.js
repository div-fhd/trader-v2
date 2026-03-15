const { EMA, RSI, ATR, MACD } = require("technicalindicators");

/**
 * يحسب كل المؤشرات من مصفوفة كاندلز.
 * يُستخدم لكل timeframe (15m, 1h, 4h).
 */
function calculateIndicators(candles) {
  if (!candles || candles.length < 210) return null;

  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);
  const volumes = candles.map(c => c.volume);

  // ── EMA ──────────────────────────────────────────────
  const ema21Arr  = EMA.calculate({ period: 21,  values: closes });
  const ema50Arr  = EMA.calculate({ period: 50,  values: closes });
  const ema200Arr = EMA.calculate({ period: 200, values: closes });

  // ── RSI ──────────────────────────────────────────────
  const rsiArr = RSI.calculate({ period: 14, values: closes });

  // ── ATR: يحدد حجم الـ SL والـ Targets بدقة ───────────
  const atrArr = ATR.calculate({
    period: 14,
    high:   highs,
    low:    lows,
    close:  closes,
  });

  // ── MACD: يؤكد momentum الحركة ───────────────────────
  const macdArr = MACD.calculate({
    values:             closes,
    fastPeriod:         12,
    slowPeriod:         26,
    signalPeriod:       9,
    SimpleMAOscillator: false,
    SimpleMASignal:     false,
  });

  // ── Volume analysis ───────────────────────────────────
  const recentVols = volumes.slice(-20);
  const avgVol20   = recentVols.reduce((s, v) => s + v, 0) / recentVols.length;
  const lastVol    = volumes[volumes.length - 1];
  const prevVol    = volumes[volumes.length - 2];

  // ── Candle body analysis (آخر كاندل) ─────────────────
  const last       = candles[candles.length - 1];
  const candleBody  = Math.abs(last.close - last.open);
  const candleRange = last.high - last.low;
  const bodyRatio   = candleRange > 0 ? candleBody / candleRange : 0;
  // كاندل قوي: الجسم يمثل أكثر من 55% من الرينج الكامل
  const isBullishBar = last.close > last.open && bodyRatio > 0.55;
  const isBearishBar = last.close < last.open && bodyRatio > 0.55;

  const lastMACD = macdArr.length     ? macdArr[macdArr.length - 1] : null;
  const prevMACD = macdArr.length > 1 ? macdArr[macdArr.length - 2] : null;

  // MACD crossover: هل قطع للتو؟
  const macdBullishCross = lastMACD && prevMACD
    ? prevMACD.MACD <= prevMACD.signal && lastMACD.MACD > lastMACD.signal
    : false;
  const macdBearishCross = lastMACD && prevMACD
    ? prevMACD.MACD >= prevMACD.signal && lastMACD.MACD < lastMACD.signal
    : false;

  // MACD momentum: هل الـ histogram يتسع؟
  const macdMomentumUp   = lastMACD?.histogram > 0
    && lastMACD.histogram > (prevMACD?.histogram ?? 0);
  const macdMomentumDown = lastMACD?.histogram < 0
    && lastMACD.histogram < (prevMACD?.histogram ?? 0);

  return {
    currentClose: closes[closes.length - 1],
    prevClose:    closes[closes.length - 2],
    high:         last.high,
    low:          last.low,

    ema21:  ema21Arr.length  ? ema21Arr[ema21Arr.length - 1]   : null,
    ema50:  ema50Arr.length  ? ema50Arr[ema50Arr.length - 1]   : null,
    ema200: ema200Arr.length ? ema200Arr[ema200Arr.length - 1] : null,

    rsi: rsiArr.length ? rsiArr[rsiArr.length - 1] : null,

    atr: atrArr.length ? atrArr[atrArr.length - 1] : null,

    macd:          lastMACD?.MACD      ?? null,
    macdSignal:    lastMACD?.signal    ?? null,
    macdHistogram: lastMACD?.histogram ?? null,
    macdBullishCross,
    macdBearishCross,
    macdMomentumUp,
    macdMomentumDown,

    avgVolume:   avgVol20,
    lastVolume:  lastVol,
    // حجم أعلى 40% من المعدل = اهتمام حقيقي بالحركة
    volumeSurge: lastVol > avgVol20 * 1.4,
    // حجم يتراكم على مدى كاندلين = ضغط متراكم
    volumeBuildup: prevVol > avgVol20 * 1.2 && lastVol > prevVol,

    isBullishBar,
    isBearishBar,
    bodyRatio,
  };
}

module.exports = { calculateIndicators };
