// Helper to run redis_failover_test.js with an inline env var (useful on Windows shells)
process.env.REDIS_FAILOVER_URLS = process.env.REDIS_FAILOVER_URLS || 'redis://127.0.0.1:6379'
require('./redis_failover_test.js')
