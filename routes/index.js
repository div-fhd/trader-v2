var express = require('express');
const binance = require("../services/binance.service");
const indicators = require("../services/indicators.service");
const aiService = require("../services/ai.service");
const telegram = require("../services/telegram.service");
const Signal = require("../models/Signal");

var router = express.Router();    

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

 
const { getLogs } = require("../utils/liveLogs");

// router.get("/logs", function (req, res) {
//   res.json({
//     logs: getLogs()
//   });
// });

router.get("/signals", async function (req, res) {
  const signals = await Signal.find().sort({ createdAt: -1 });
  res.json(signals);
});
router.get("/test-signal-save", async function (req, res) {
  const signal = await Signal.create({
    symbol: "BTCUSDT",
    timeframe: "15m",
    shouldTrade: true,
    direction: "LONG",
    entryMin: 67850,
    entryMax: 68050,
    stopLoss: 67400,
    targets: [68150, 68300, 68500],
    confidence: 80,
    summary: "Test signal near current price",
    status: "SENT"
  });

  res.json(signal);      
});
router.get("/test-price", async function(req, res) {

  const price = await binance.getPrice("BTCUSDT");

  res.json({
    coin: "BTCUSDT",
    price
  });

});

router.get("/test-indicators", async function(req, res) {

  const candles = await binance.getKlines("BTCUSDT");

  const data = indicators.calculateIndicators(candles);

  res.json(data);

});

router.get("/test-ai", async function(req, res) {
  try {
    const candles = await binance.getKlines("BTCUSDT", "15m", 300);
    const data = indicators.calculateIndicators(candles);

    const result = await aiService.analyzeSignal({
      symbol: "BTCUSDT",
      timeframe: "15m",
      ...data
    });

    res.json(result);
  } catch (error) {   
    console.error("AI TEST ERROR:", error.message);
    res.status(500).json({
      error: error.message
    });
  }
});

router.get("/test-telegram", async function(req, res) {

  await telegram.sendSignal({
    symbol: "BTCUSDT",
    direction: "LONG",
    entryMin: 67800,
    entryMax: 68000,
    stopLoss: 67400,
    targets: [68400, 69000, 69500],
    confidence: 82,
    summary: "Bullish continuation setup"
  });

  res.json({ status: "sent" });

});

module.exports = router;
