import { Bot, session } from 'grammy';
import { RedisAdapter } from '@grammyjs/storage-redis';
import { createClient } from 'redis';
// import { env } from '@trade/config';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

const env = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  REDIS_URL: process.env.REDIS_URL || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info'
};
// import { logger } from '@trade/logger';
import pino from 'pino';

const logger = pino({
  level: 'debug', // Changed to debug for detailed logging
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});
import { MyContext, SessionData } from './types';
import { positionCommands } from './commands/position';
import { tradeCommands } from './commands/trade';
import { handleAnalyzeCommand } from './commands/analyze';
import { handleMakePositionCallback } from './commands/position-callback';


// Bot instance
const bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);

// Redis client for session storage
let redisClient: ReturnType<typeof createClient> | null = null;

async function setupRedis() {
  // Check if Redis is enabled
  if (!env.REDIS_URL || env.REDIS_URL.trim() === '') {
    logger.info('🔄 Redis disabled, using in-memory session storage...');
    
    // Use in-memory session storage directly
    bot.use(session({
      initial: (): SessionData => {
        logger.debug('🆕 Creating new in-memory session');
        return {};
      }
    }));
    
    logger.info('✅ In-memory session storage configured');
    return;
  }

  try {
    logger.info('🔄 Attempting to connect to Redis...', { 
      url: 'Redis URL configured' 
    });
    
    // Create Redis client with TLS support for Redis Cloud
    redisClient = createClient({ 
      url: env.REDIS_URL,
      socket: {
        tls: env.REDIS_URL.startsWith('rediss://'),
        rejectUnauthorized: false, // Required for Redis Cloud
        connectTimeout: 8000 // 8 second timeout
      }
    });
    
    // Add error handling
    redisClient.on('error', (err) => {
      logger.warn('🟡 Redis error', { error: err.message });
    });
    
    redisClient.on('connect', () => {
      logger.info('🟡 Redis connecting...');
    });
    
    redisClient.on('ready', () => {
      logger.info('🟢 Redis ready and connected');
    });

    // Connect with shorter timeout
    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
      )
    ]);
    
    logger.info('✅ Redis connected successfully');
    
    // Use Redis adapter for session storage
    bot.use(session({
      initial: (): SessionData => {
        logger.debug('🆕 Creating new Redis session');
        return {};
      },
      storage: new RedisAdapter({ instance: redisClient })
    }));
    
    logger.info('✅ Redis session storage configured');
    
  } catch (error: any) {
    logger.warn('⚠️ Redis connection failed, falling back to in-memory storage', { 
      error: error.message
    });
    
    // Clean up failed Redis client
    if (redisClient) {
      try {
        await redisClient.quit();
      } catch (e) {
        // Ignore cleanup errors
      }
      redisClient = null;
    }
    
    // Fallback to in-memory session storage
    logger.info('🔄 Using in-memory session storage...');
    bot.use(session({
      initial: (): SessionData => {
        logger.debug('🆕 Creating new in-memory session');
        return {};
      }
    }));
    
    logger.info('✅ In-memory session storage configured');
  }
}


// Logging middleware (first to capture all requests)
bot.use(async (ctx, next) => {
  const start = Date.now();
  const userId = ctx.from?.id;
  const chatId = ctx.chat?.id;
  const messageText = ctx.message?.text || ctx.callbackQuery?.data || 'unknown';
  
  logger.info('📨 Incoming update', {
    userId,
    chatId,
    messageText,
    updateType: ctx.update.message ? 'message' : ctx.update.callback_query ? 'callback_query' : 'other',
    updateId: ctx.update.update_id,
    hasSession: !!ctx.session
  });
  
  try {
    await next();
    const duration = Date.now() - start;
    logger.info('✅ Update processed successfully', { 
      userId, 
      chatId, 
      duration: `${duration}ms`,
      updateId: ctx.update.update_id
    });
  } catch (error: any) {
    const duration = Date.now() - start;
    logger.error('❌ Update processing failed in middleware', { 
      userId, 
      chatId, 
      duration: `${duration}ms`,
      updateId: ctx.update.update_id,
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack?.substring(0, 500) // Limit stack trace length
    });
    throw error;
  }
});

// Session initialization middleware (after session middleware is set up)
bot.use(async (ctx, next) => {
  try {
    // Ensure session exists and initialize it properly
    if (!ctx.session) {
      ctx.session = {} as any;
    }

    // Initialize session properties only if not already set
    if (!ctx.session.userId && ctx.from) {
      ctx.session.userId = ctx.from.id;
    }
    if (!ctx.session.chatId && ctx.chat) {
      ctx.session.chatId = ctx.chat.id;
    }

    await next();
  } catch (error: any) {
    logger.error('❌ Error in session middleware', {
      error: error.message,
      errorName: error.name,
      fromId: ctx.from?.id,
      chatId: ctx.chat?.id
    });
    throw error;
  }
});

// Error boundary middleware
bot.catch((err) => {
  const ctx = err.ctx;
  const error = err.error as any; // Type assertion for error object
  
  // Detailed error logging
  logger.error('🔥 DETAILED ERROR in bot handler', {
    error: {
      name: error?.name || 'Unknown',
      message: error?.message || 'No message',
      stack: error?.stack || 'No stack trace',
      cause: error?.cause || 'No cause'
    },
    update: {
      updateId: ctx.update.update_id,
      type: ctx.update.message ? 'message' : 
            ctx.update.callback_query ? 'callback_query' : 
            ctx.update.inline_query ? 'inline_query' : 'other',
      messageText: ctx.update.message?.text || ctx.update.callback_query?.data || 'N/A'
    },
    user: {
      userId: ctx.from?.id,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name
    },
    chat: {
      chatId: ctx.chat?.id,
      chatType: ctx.chat?.type
    },
    session: ctx.session || 'No session'
  });
  
  // Send user-friendly error message
  ctx.reply('Sorry, something went wrong. Please try again later.').catch((replyError: any) => {
    logger.error('Failed to send error message to user', {
      originalError: error?.message || 'Unknown error',
      replyError: replyError?.message || 'Unknown reply error'
    });
  });
});

// Register command handlers
bot.use(positionCommands);
bot.use(tradeCommands);

// Command handlers
bot.command('start', async (ctx) => {
  try {
    logger.info('🚀 /start command triggered', {
      userId: ctx.from?.id,
      firstName: ctx.from?.first_name,
      chatId: ctx.chat?.id
    });

    const firstName = ctx.from?.first_name || 'there';
    const welcomeMessage = `
🤖 Welcome to the AI Trading Bot, ${firstName}!

I'm here to help you analyze markets and manage your trading positions.

Available commands:
/help - Show all available commands
/trade - Start market analysis
/position - Manage your positions
/pnl - View your P&L reports

Let's get started! Use /help to see all available features.
    `.trim();
    
    await ctx.reply(welcomeMessage);
    logger.info('✅ /start command completed successfully', { 
      userId: ctx.from?.id, 
      firstName 
    });
  } catch (error: any) {
    logger.error('❌ Error in /start command', {
      userId: ctx.from?.id,
      error: error.message,
      stack: error.stack?.substring(0, 300)
    });
    throw error;
  }
});

bot.command('help', async (ctx) => {
  const helpMessage = `
📚 **AI Trading Bot Commands**

**Market Analysis:**
/analyze - Multi-market AI analysis with ranking & plans
/trade - Analyze markets with AI assistance

**Position Management:**
/position - Open, view, and manage positions
/position list - View all open positions
/position parse - Parse position from text

**Reports:**
/pnl - View profit & loss reports
/journal - Trading journal and notes
/export - Export trading data

**Settings:**
/config - Bot configuration
/alerts - Manage alerts

**Support:**
/help - Show this help message
/start - Restart the bot

**Advanced Analysis:**
\`/analyze horizon=1w markets=crypto,spx symbols=BTCUSDT top=3\`
- horizon: 1w|2w|1m|3m (analysis timeframe)
- markets: crypto,spx,bist (markets to scan)
- symbols: specific symbols to analyze
- top: number of top results to show

Need help with a specific command? Just type it and I'll guide you through!
  `.trim();
  
  await ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

// Other commands
bot.command('pnl', async (ctx) => {
  await ctx.reply('💰 P&L reporting feature is coming soon!');
});

bot.command('config', async (ctx) => {
  await ctx.reply('⚙️ Configuration feature is coming soon!');
});

bot.command('alerts', async (ctx) => {
  await ctx.reply('🔔 Alerts management feature is coming soon!');
});

bot.command('analyze', async (ctx) => {
  try {
    const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
    await handleAnalyzeCommand(ctx, args);
  } catch (error: any) {
    logger.error('❌ Error in /analyze command', {
      userId: ctx.from?.id,
      error: error.message,
      stack: error.stack?.substring(0, 300)
    });
    await ctx.reply('❌ Analysis failed. Please try again or use /help for command syntax.');
  }
});

// Handle callback queries (button clicks)
bot.on('callback_query', async (ctx) => {
  try {
    const callbackData = ctx.callbackQuery?.data;
    if (!callbackData) {
      await ctx.answerCallbackQuery('❌ Invalid callback data');
      return;
    }

    if (callbackData.startsWith('position_')) {
      await handleMakePositionCallback(ctx, callbackData);
    } else if (callbackData.startsWith('view_position_')) {
      const positionId = callbackData.replace('view_position_', '');
      await ctx.answerCallbackQuery('📊 Position view coming soon!');
    } else if (callbackData.startsWith('close_position_')) {
      const positionId = callbackData.replace('close_position_', '');
      await ctx.answerCallbackQuery('❌ Position closing coming soon!');
    } else {
      await ctx.answerCallbackQuery('❓ Unknown action');
    }
  } catch (error: any) {
    logger.error('❌ Error in callback query handler', {
      userId: ctx.from?.id,
      error: error.message,
      stack: error.stack?.substring(0, 300)
    });
    await ctx.answerCallbackQuery('❌ Something went wrong');
  }
});

// Handle unknown commands
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) {
    await ctx.reply('❓ Unknown command. Use /help to see available commands.');
  } else {
    // For now, just acknowledge non-command messages
    await ctx.reply('👋 I received your message! Use /help to see what I can do for you.');
  }
});

// Graceful shutdown
async function shutdown() {
  logger.info('Shutting down bot...');
  
  try {
    await bot.stop();
    logger.info('Bot stopped');
  } catch (error) {
    logger.error('Error stopping bot', { error });
  }
  
  if (redisClient) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection', { error });
    }
  }
  
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Start the bot
async function startBot() {
  try {
    logger.info('Starting AI Trading Bot...', {
      nodeEnv: env.NODE_ENV,
      logLevel: env.LOG_LEVEL
    });
    
    // Setup Redis session storage
    await setupRedis();
    
    // Start the bot
    await bot.start();
    logger.info('Bot started successfully');
    
  } catch (error) {
    logger.error('Failed to start bot', { error });
    process.exit(1);
  }
}

// Start the application
if (require.main === module) {
  startBot();
}

export { bot, logger };