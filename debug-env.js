// Debug environment variables
require('dotenv').config();

console.log('Environment variables loaded:');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? 'SET' : 'NOT SET');
console.log('WEBHOOK_SECRET:', process.env.WEBHOOK_SECRET ? 'SET' : 'NOT SET');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
console.log('REDIS_URL:', process.env.REDIS_URL ? 'SET' : 'NOT SET');
console.log('PORT:', process.env.PORT ? 'SET' : 'NOT SET');
console.log('NODE_ENV:', process.env.NODE_ENV ? 'SET' : 'NOT SET');
console.log('LOG_LEVEL:', process.env.LOG_LEVEL ? 'SET' : 'NOT SET');

// Check numeric variables
console.log('\nNumeric variables:');
console.log('DEFAULT_RISK_PCT:', process.env.DEFAULT_RISK_PCT ? process.env.DEFAULT_RISK_PCT : 'NOT SET');
console.log('MAX_LEVERAGE:', process.env.MAX_LEVERAGE ? process.env.MAX_LEVERAGE : 'NOT SET');
console.log('MIN_RR:', process.env.MIN_RR ? process.env.MIN_RR : 'NOT SET');
console.log('DATA_STALENESS_SEC:', process.env.DATA_STALENESS_SEC ? process.env.DATA_STALENESS_SEC : 'NOT SET');
console.log('BACKTEST_MAX_YEARS:', process.env.BACKTEST_MAX_YEARS ? process.env.BACKTEST_MAX_YEARS : 'NOT SET');
console.log('SCAN_TOP_K:', process.env.SCAN_TOP_K ? process.env.SCAN_TOP_K : 'NOT SET');

// Try to import the config to see the exact error
try {
  const { env } = require('./packages/config/dist/index');
  console.log('✅ Config loaded successfully');
} catch (error) {
  console.error('❌ Config failed:', error.message);
}