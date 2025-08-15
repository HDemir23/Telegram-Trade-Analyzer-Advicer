import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env
// Look for .env in the project root
const envPath = path.join(__dirname, '../../../.env');
dotenv.config({ path: envPath });

// Also try from current working directory as fallback
if (!process.env.TELEGRAM_BOT_TOKEN) {
  dotenv.config();
}

const envSchema = z.object({
  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
  WEBHOOK_SECRET: z.string().min(1, 'WEBHOOK_SECRET is required').optional(),

  // AI Providers (optional, as routing handles fallbacks)
  OPENROUTER_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // Market Data (pick at least one equity provider)
  POLYGON_API_KEY: z.string().optional(),
  ALPHAVANTAGE_API_KEY: z.string().optional(),

  // Execution keys (optional, not used for auto-trading)
  BINANCE_KEY: z.string().optional(),
  BINANCE_SECRET: z.string().optional(),
  BYBIT_KEY: z.string().optional(),
  BYBIT_SECRET: z.string().optional(),

  // Infra  
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL').optional(),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL').optional(),
  PORT: z.preprocess(
    (val: unknown) => Number(val),
    z.number().int().positive('PORT must be a positive integer')
  ),
  NODE_ENV: z.enum(['development', 'production', 'test']),
  LOG_LEVEL: z.enum(['info', 'warn', 'error', 'debug', 'verbose']),

  // Risk & Limits (defaults, overridable in chat /config)
  DEFAULT_RISK_PCT: z.preprocess(
    (val: unknown) => Number(val),
    z.number().positive('DEFAULT_RISK_PCT must be a positive number')
  ),
  MAX_LEVERAGE: z.preprocess(
    (val: unknown) => Number(val),
    z.number().int().positive('MAX_LEVERAGE must be a positive integer')
  ),
  MIN_RR: z.preprocess(
    (val: unknown) => Number(val),
    z.number().positive('MIN_RR must be a positive number')
  ),
  DATA_STALENESS_SEC: z.preprocess(
    (val: unknown) => Number(val),
    z.number().int().positive('DATA_STALENESS_SEC must be a positive integer')
  ),
  BACKTEST_MAX_YEARS: z.preprocess(
    (val: unknown) => Number(val),
    z.number().int().positive('BACKTEST_MAX_YEARS must be a positive integer')
  ),

  // Analysis & Universe Settings
  SCAN_TOP_K: z.preprocess(
    (val: unknown) => Number(val),
    z.number().int().positive().optional()
  ),
  SCAN_DEFAULT_MARKETS: z.string().optional(),
  ANALYSIS_RESULT_COUNT: z.preprocess(
    (val: unknown) => Number(val),
    z.number().int().positive().optional()
  ),
  DEFAULT_ANALYSIS_SCOPE: z.string().optional(),
  DEFAULT_ANALYSIS_COUNT: z.preprocess(
    (val: unknown) => Number(val),
    z.number().int().positive().optional()
  ),
  UNIVERSE_CRYPTO: z.string().optional(),
  UNIVERSE_SPX: z.string().optional(),
  UNIVERSE_BIST: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

let parsedEnv: Env;

try {
  parsedEnv = envSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('Environment variable validation failed:');
    error.errors.forEach((e: z.ZodIssue) => {
      console.error(`  - ${e.path.join('.')}: ${e.message}`);
    });
  } else {
    console.error('An unexpected error occurred during environment variable validation:', error instanceof Error ? error.message : String(error));
  }
  process.exit(1);
}

export const env = parsedEnv;