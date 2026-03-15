const logs = [];

function addLog(message) {
  const line = `[${new Date().toLocaleString()}] ${message}`;

  logs.unshift(line);

  if (logs.length > 300) {
    logs.pop();
  }
}

function getLogs() {
  return logs;
}

module.exports = {
  addLog,
  getLogs
};