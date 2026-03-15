const OpenAI = require("openai");

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * GPT دوره التحقق فقط (validator) — الكود هو من يقرر الـ setup.
 *
 * تغييرات الـ prompt:
 * - أزلنا volumeSurge/isBullishBar — كانت GPT ترفض بسببها تلقائياً
 * - أرسلنا نسبة الحجم الفعلي (volume ratio) بدلاً من boolean
 * - أزلنا قاعدة "Reject if no volume confirmation" من الـ Rules
 * - خففنا لهجة الـ Rules لأن الفلتر الأساسي تم في الكود
 */
async function validateSetup({ symbol, direction, ltf, mtf, htf }) {
  const htfBias = htf.currentClose > htf.ema200 ? "BULLISH" : "BEARISH";
  const mtfBias = mtf.currentClose > mtf.ema50  ? "BULLISH" : "BEARISH";

  const volRatio = ltf.lastVolume && ltf.avgVolume
    ? (ltf.lastVolume / ltf.avgVolume).toFixed(2) + "x avg"
    : "N/A";

  const prompt = `
You are a senior crypto futures trader doing a final check on a trade setup.
The algorithm has already filtered this setup through technical criteria.
Your job: APPROVE if the overall picture is acceptable, REJECT only if something is clearly wrong.
Lean toward approving — the algorithm handles strict filtering.

Setup
Symbol:    ${symbol}
Direction: ${direction}

4H — Trend
Bias vs EMA200: ${htfBias}
RSI: ${htf.rsi?.toFixed(1)}
MACD momentum: ${htf.macdMomentumUp ? "UP" : htf.macdMomentumDown ? "DOWN" : "NEUTRAL"}

1H — Momentum
Bias vs EMA50: ${mtfBias}
RSI: ${mtf.rsi?.toFixed(1)}
MACD cross: ${mtf.macdBullishCross ? "BULLISH" : mtf.macdBearishCross ? "BEARISH" : "NONE"}

15M — Entry
Price: ${ltf.currentClose}
EMA21: ${ltf.ema21?.toFixed(4)}
EMA50: ${ltf.ema50?.toFixed(4)}
EMA200: ${ltf.ema200?.toFixed(4)}
RSI: ${ltf.rsi?.toFixed(1)}
ATR: ${ltf.atr?.toFixed(4)}
MACD histogram: ${ltf.macdHistogram?.toFixed(5)}
Volume: ${volRatio}

Rules
- REJECT if HTF bias directly contradicts direction (BULLISH trend + SHORT, or BEARISH trend + LONG)
- REJECT if RSI(15m) > 75 for LONG or < 25 for SHORT (extreme zones)
- REJECT if price is clearly far from EMA21 and EMA50 on 15m (not in pullback zone)
- APPROVE if the trend is aligned and price is near a key EMA level

Return ONLY valid JSON, no markdown:
{
  "approved": true or false,
  "confidence": number 0-100,
  "reason": "one concise sentence"
}
`;

  const response = await client.chat.completions.create({
    model:       "gpt-4o",
    max_tokens:  150,
    temperature: 0.3,
    messages: [
      {
        role:    "system",
        content: "You are a trading setup validator. Return only valid JSON. No markdown.",
      },
      { role: "user", content: prompt },
    ],
  });

  const raw = response.choices[0].message.content
    .trim()
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    const result = JSON.parse(raw);
    if (typeof result.approved    !== "boolean") throw new Error("missing approved");
    if (typeof result.confidence  !== "number")  result.confidence = 50;
    if (!result.reason)                          result.reason = "N/A";
    return result;
  } catch {
    throw new Error(`GPT returned invalid JSON: ${raw}`);
  }
}

module.exports = { validateSetup };
