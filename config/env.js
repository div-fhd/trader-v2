/**
 * التحقق من وجود كل متغيرات البيئة المطلوبة عند بدء التشغيل.
 * إذا كان أي متغير ناقصاً، السيرفر لن يبدأ بدل ما يفشل بصمت.
 */
const required = [
  "MONGO_URI",
  "OPENAI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_CHAT_ID",
];

for (const key of required) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

module.exports = process.env;
