const axios = require("axios");
const { calculateIndicators } = require("./indicators.service");

const BASE    = "https://fapi.binance.com";
const TIMEOUT = 10000; // 10 ثواني max لكل طلب

async function getPrice(symbol) {
  const { data } = await axios.get(
    `${BASE}/fapi/v1/ticker/price?symbol=${symbol}`,
    { timeout: TIMEOUT }
  );
  return parseFloat(data.price);
}

async function getKlines(symbol, interval = "15m", limit = 300) {
  const { data } = await axios.get(
    `${BASE}/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
    { timeout: TIMEOUT }
  );
  return data.map(k => ({
    open:   parseFloat(k[1]),
    high:   parseFloat(k[2]),
    low:    parseFloat(k[3]),
    close:  parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
}

/**
 * يجلب بيانات 3 timeframes بشكل متوازٍ ويحسب مؤشراتها.
 * 4h  → يحدد الاتجاه الرئيسي (HTF)
 * 1h  → يؤكد الاتجاه المتوسط (MTF)
 * 15m → يحدد نقطة الدخول الدقيقة (LTF)
 */
async function getMultiTimeframeData(symbol) {
  const [candles4h, candles1h, candles15m] = await Promise.all([
    getKlines(symbol, "4h",  250),
    getKlines(symbol, "1h",  250),
    getKlines(symbol, "15m", 300),
  ]);

  const htf = calculateIndicators(candles4h);
  const mtf = calculateIndicators(candles1h);
  const ltf = calculateIndicators(candles15m);

  if (!htf || !mtf || !ltf) return null;

  return { htf, mtf, ltf };
}

module.exports = { getPrice, getKlines, getMultiTimeframeData };
