const DEFAULT_TIMEOUT_MS = 30000;

function getMongoUri() {
  const uri = String(process.env.MONGO_URI || "").trim();
  return uri;
}

function getMongoOptions(overrides = {}) {
  return {
    tls: true,
    retryWrites: true,
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
    family: 4,
    maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10,
    ...overrides,
  };
}

module.exports = { getMongoOptions, getMongoUri };
