const state = {
  date: null,
  sessions: {}
};

function getTodayKey() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hebron",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);

  const year = parts.find(p => p.type === "year").value;
  const month = parts.find(p => p.type === "month").value;
  const day = parts.find(p => p.type === "day").value;

  return `${year}-${month}-${day}`;
}

function resetIfNewDay() {
  const today = getTodayKey();

  if (state.date !== today) {
    state.date = today;
    state.sessions = {};
  }
}

function canSend(sessionKey) {
  resetIfNewDay();
  return !state.sessions[sessionKey];
}

function markSent(sessionKey) {
  resetIfNewDay();
  state.sessions[sessionKey] = true;
}

module.exports = {
  canSend,
  markSent
};