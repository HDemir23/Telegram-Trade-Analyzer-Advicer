"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const zod_1 = require("zod");
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load environment variables from .env
// Look for .env in the project root
const envPath = path_1.default.join(__dirname, '../../../.env');
dotenv_1.default.config({ path: envPath });
// Also try from current working directory as fallback
if (!process.env.TELEGRAM_BOT_TOKEN) {
    dotenv_1.default.config();
}
const envSchema = zod_1.z.object({
    // Telegram
    TELEGRAM_BOT_TOKEN: zod_1.z.string().min(1, 'TELEGRAM_BOT_TOKEN is required'),
    WEBHOOK_SECRET: zod_1.z.string().min(1, 'WEBHOOK_SECRET is required'),
    // AI Providers (optional, as routing handles fallbacks)
    OPENROUTER_API_KEY: zod_1.z.string().optional(),
    OPENAI_API_KEY: zod_1.z.string().optional(),
    ANTHROPIC_API_KEY: zod_1.z.string().optional(),
    // Market Data (pick at least one equity provider)
    POLYGON_API_KEY: zod_1.z.string().optional(),
    ALPHAVANTAGE_API_KEY: zod_1.z.string().optional(),
    // Execution keys (optional, not used for auto-trading)
    BINANCE_KEY: zod_1.z.string().optional(),
    BINANCE_SECRET: zod_1.z.string().optional(),
    BYBIT_KEY: zod_1.z.string().optional(),
    BYBIT_SECRET: zod_1.z.string().optional(),
    // Infra
    DATABASE_URL: zod_1.z.string().url('DATABASE_URL must be a valid URL'),
    REDIS_URL: zod_1.z.string().url('REDIS_URL must be a valid URL'),
    PORT: zod_1.z.preprocess((val) => Number(val), zod_1.z.number().int().positive('PORT must be a positive integer')),
    NODE_ENV: zod_1.z.enum(['development', 'production', 'test']),
    LOG_LEVEL: zod_1.z.enum(['info', 'warn', 'error', 'debug', 'verbose']),
    // Risk & Limits (defaults, overridable in chat /config)
    DEFAULT_RISK_PCT: zod_1.z.preprocess((val) => Number(val), zod_1.z.number().positive('DEFAULT_RISK_PCT must be a positive number')),
    MAX_LEVERAGE: zod_1.z.preprocess((val) => Number(val), zod_1.z.number().int().positive('MAX_LEVERAGE must be a positive integer')),
    MIN_RR: zod_1.z.preprocess((val) => Number(val), zod_1.z.number().positive('MIN_RR must be a positive number')),
    DATA_STALENESS_SEC: zod_1.z.preprocess((val) => Number(val), zod_1.z.number().int().positive('DATA_STALENESS_SEC must be a positive integer')),
    BACKTEST_MAX_YEARS: zod_1.z.preprocess((val) => Number(val), zod_1.z.number().int().positive('BACKTEST_MAX_YEARS must be a positive integer')),
    // Analysis & Universe Settings
    SCAN_TOP_K: zod_1.z.preprocess((val) => Number(val), zod_1.z.number().int().positive().optional()),
    SCAN_DEFAULT_MARKETS: zod_1.z.string().optional(),
    UNIVERSE_CRYPTO: zod_1.z.string().optional(),
    UNIVERSE_SPX: zod_1.z.string().optional(),
    UNIVERSE_BIST: zod_1.z.string().optional(),
});
let parsedEnv;
try {
    parsedEnv = envSchema.parse(process.env);
}
catch (error) {
    if (error instanceof zod_1.z.ZodError) {
        console.error('Environment variable validation failed:', error.errors.map((e) => e.message).join(', '));
    }
    else {
        console.error('An unexpected error occurred during environment variable validation:', error instanceof Error ? error.message : String(error));
    }
    process.exit(1);
}
exports.env = parsedEnv;
