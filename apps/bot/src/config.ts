/**
 * Centralized bot configuration for apps/bot
 * - Reads environment variables (dotenv expected to be loaded by entrypoint)
 * - Exposes a single `botConfig` object consumed by all bot modules
 * - Keeps defaults and parsing (e.g., SKIP_ANALYSIS_ASSETS) in one place
 */

function toBool(v?: string, def = false): boolean {
  if (v === undefined) return def;
  return v === 'true' || v === '1';
}

function mask(s?: string) {
  if (!s) return '';
  if (s.length <= 8) return '****';
  return `${s.slice(0,4)}...${s.slice(-4)}`;
}

export const botConfig = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  REDIS_URL: process.env.REDIS_URL || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET || '',
  DEBUG_MODE: toBool(process.env.DEBUG_MODE, false),
  SKIP_ANALYSIS_ASSETS: (process.env.SKIP_ANALYSIS_ASSETS || process.env.SKIP_ANALYZE_ASSETS || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean),
  AI_MODEL: process.env.AI_MODEL || '',
  HEALTH_PORT: parseInt(process.env.HEALTH_PORT || '8081', 10),
  DATABASE_URL: process.env.DATABASE_URL || '',
  // Defaults for scanning and multi-asset analysis
  SCAN_DEFAULT_MARKETS: (process.env.SCAN_DEFAULT_MARKETS || 'crypto,spx,bist')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean),
  ANALYSIS_RESULT_COUNT: parseInt(process.env.ANALYSIS_RESULT_COUNT || '3', 10)
};

/**
 * Utility to print a safe view of the config (avoid leaking secrets)
 */
export function safeConfigView() {
  return {
    TELEGRAM_BOT_TOKEN: mask(botConfig.TELEGRAM_BOT_TOKEN),
    REDIS_URL: mask(botConfig.REDIS_URL),
    NODE_ENV: botConfig.NODE_ENV,
    LOG_LEVEL: botConfig.LOG_LEVEL,
    WEBHOOK_SECRET: mask(botConfig.WEBHOOK_SECRET),
    DEBUG_MODE: botConfig.DEBUG_MODE,
    SKIP_ANALYSIS_ASSETS: botConfig.SKIP_ANALYSIS_ASSETS,
    AI_MODEL: botConfig.AI_MODEL,
    HEALTH_PORT: botConfig.HEALTH_PORT
  };
}