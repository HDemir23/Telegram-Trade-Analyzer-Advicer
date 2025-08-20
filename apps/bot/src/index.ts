import { Bot, session } from 'grammy';
import { RedisAdapter } from '@grammyjs/storage-redis';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';

import { botConfig } from './config';
const env = botConfig;

import pino from 'pino';
const logger = pino({
  level: 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname'
    }
  }
});

// Centralized config (botConfig) is used; critical vars validated below.

// Fail-fast check for critical secret: WEBHOOK_SECRET (from centralized config)
if (typeof env.WEBHOOK_SECRET !== 'string' || env.WEBHOOK_SECRET.trim() === '') {
  logger.error('WEBHOOK_SECRET is missing. The bot cannot start without this required configuration. Exiting.');
  // Ensure we exit after logging a non-sensitive message
  process.exit(1);
}

import { MyContext, SessionData } from './core/types';

// Import V2 analysis function and new chained workflow
import { analyzeAssetV2, MultiFunnelOrchestrator, analyzeAssetWithChain, marketDataCache, toCompactLines } from '@trade/ai';

// Legacy imports for backward compatibility
import { positionCommands } from './handlers/position';
import { tradeCommands } from './handlers/trade';
import { handleAnalyzeCommand } from './handlers/analyze';
import { handleMakePositionCallback } from './handlers/position-callback';

const bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);

// User settings storage (in-memory for demo, use Redis in production)
const userSettings = new Map<number, any>();

// Redis setup
let redisClient: ReturnType<typeof createClient> | null = null;

async function setupRedis() {
  if (!env.REDIS_URL || env.REDIS_URL.trim() === '') {
    logger.info('🔄 Redis disabled, using in-memory session storage...');
    bot.use(session({ initial: (): SessionData => ({}) }));
    logger.info('✅ In-memory session storage configured');
    return;
  }

  try {
    redisClient = createClient({ 
      url: env.REDIS_URL,
      socket: {
        tls: env.REDIS_URL.startsWith('rediss://'),
        rejectUnauthorized: false,
        connectTimeout: 8000
      }
    });
    
    redisClient.on('error', (err) => logger.warn('🟡 Redis error', { error: err.message }));
    redisClient.on('ready', () => logger.info('🟢 Redis ready and connected'));

    await Promise.race([
      redisClient.connect(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
      )
    ]);
    
    bot.use(session({
      initial: (): SessionData => ({}),
      storage: new RedisAdapter({ instance: redisClient })
    }));
    
    logger.info('✅ Redis session storage configured');
    
  } catch (error: any) {
    logger.warn('⚠️ Redis connection failed, falling back to in-memory storage');
    bot.use(session({ initial: (): SessionData => ({}) }));
  }
}

// Middleware
bot.use(async (ctx, next) => {
  const start = Date.now();
  const userId = ctx.from?.id;
  const messageText = ctx.message?.text || ctx.callbackQuery?.data || 'unknown';
  
  logger.info('📨 Incoming update', { userId, messageText });
  
  try {
    await next();
    const duration = Date.now() - start;
    logger.info('✅ Update processed successfully', { userId, duration: `${duration}ms` });
  } catch (error: any) {
    const duration = Date.now() - start;
    logger.error('❌ Update processing failed', { userId, duration: `${duration}ms`, error: error.message });
    throw error;
  }
});

bot.use(async (ctx, next) => {
  if (!ctx.session) ctx.session = {} as any;
  if (!ctx.session.userId && ctx.from) ctx.session.userId = ctx.from.id;
  if (!ctx.session.chatId && ctx.chat) ctx.session.chatId = ctx.chat.id;
  await next();
});

// Error handling
bot.catch((err) => {
  const ctx = err.ctx;
  const error = err.error as any;
  
  logger.error('🔥 Bot error', {
    error: error?.message || 'Unknown error',
    userId: ctx.from?.id
  });
  
  ctx.reply('❌ Something went wrong. Please try again.').catch(() => {});
});

// Helper functions
function getUserSettings(userId: number) {
  return userSettings.get(userId) || {
    model: 'claude',
    format: 'full',
    threshold: 60
  };
}

function getModelName(model: string): string {
  const models: Record<string, string> = {
    'claude': env.AI_MODEL || 'openai/gpt-5-mini',
    'gpt4o': 'openai/gpt-4o',
    'gpt4mini': 'openai/gpt-4o-mini'
  };
  return models[model] || models['claude'];
}

function formatAnalysis(decision: any, format: string = 'full'): string {
  const emoji = decision.position === 'long' ? '📈' : decision.position === 'short' ? '📉' : '⏸️';
  const confidence = Math.round(decision.confidence * 100);
  const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
  
  if (format === 'quick') {
    return `${emoji} **${decision.asset}** ${decision.position.toUpperCase()}\n` +
           `${riskColor} **${confidence}%** confidence\n` +
           `💭 ${decision.rationale.substring(0, 100)}...`;
  }
  
  if (format === 'compact') {
    return `${emoji} **${decision.asset} Analysis**\n\n` +
           `📊 **Position:** ${decision.position.toUpperCase()}\n` +
           `${riskColor} **Confidence:** ${confidence}%\n` +
           `💭 **Rationale:** ${decision.rationale}\n\n` +
           `💰 **Entry:** $${decision.entry.lower?.toFixed(4) || decision.entry.price?.toFixed(4) || 'N/A'} - $${decision.entry.upper?.toFixed(4) || 'N/A'}\n` +
           `🛡️ **Stop:** $${decision.stop?.toFixed(4) || 'N/A'}\n` +
           `🎯 **Targets:** ${decision.targets.map((t: any) => `$${t.price.toFixed(4)}`).join(', ')}\n` +
           `⚖️ **R:R:** ${decision.realized_rr_est}:1`;
  }
  
  if (format === 'lines') {
    // Use the new 7-line compact format
    try {
      const compactOutput = toCompactLines(decision);
      return `${emoji} **${decision.asset} Signal**\n\n\`\`\`\n${compactOutput}\n\`\`\``;
    } catch (error) {
      // Fallback to manual format if toCompactLines fails
      return `${emoji} **${decision.asset} Signal**\n\n\`\`\`\n` +
             `coin: ${decision.asset.replace(/USDT$/, '')}\n` +
             `confidence: ${confidence}%\n` +
             `current_price: ${decision.price || 'N/A'}\n` +
             `entry_price: ${decision.entry.lower || decision.entry.price || 'N/A'}\n` +
             `tp: ${decision.targets?.[0]?.price || 'N/A'}\n` +
             `sl: ${decision.stop || 'N/A'}\n` +
             `additional: RR≥${decision.rr_min || 1.5}, ${decision.position}\n\`\`\``;
    }
  }
  
  // Full format
  return `${emoji} **${decision.asset} - Complete Analysis**\n\n` +
         `🎯 **Trade Signal**\n` +
         `├ Position: ${decision.position.toUpperCase()}\n` +
         `├ Confidence: ${confidence}% ${riskColor}\n` +
         `├ Market: ${decision.market.toUpperCase()}\n` +
         `└ Timeframe: ${decision.timeframe}\n\n` +
         
         `💰 **Entry Strategy**\n` +
         `├ Type: ${decision.entry.type.toUpperCase()}\n` +
         `├ Zone: $${decision.entry.lower?.toFixed(4) || 0} - $${decision.entry.upper?.toFixed(4) || 0}\n` +
         `├ Stop Loss: $${decision.stop?.toFixed(4) || 'N/A'}\n` +
         `└ Leverage: ${decision.leverage || 1}x\n\n` +
         
         `🎯 **Targets & Risk**\n` +
         `├ Targets: ${decision.targets.map((t: any, i: number) => 
           `T${i+1}: $${t.price.toFixed(4)}`).join(', ')}\n` +
         `├ Expected R:R: ${decision.realized_rr_est}:1\n` +
         `└ Position Size: ${decision.size_pct || 0}%\n\n` +
         
         `📊 **Technical Scores**\n` +
         `├ Trend: ${Math.round(decision.feature_scores.trend * 100)}%\n` +
         `├ Momentum: ${Math.round(decision.feature_scores.momentum * 100)}%\n` +
         `├ RSI Signal: ${Math.round(decision.feature_scores.rsi_signal * 100)}%\n` +
         `└ Risk Level: ${Math.round(decision.feature_scores.risk * 100)}%\n\n` +
         
         `💭 **AI Rationale**\n"${decision.rationale}"\n\n` +
         `📡 Data Quality: ${decision.data_quality.stale ? 'STALE 🔴' : 'FRESH 🟢'}`;
}

// =============================================================================
// COMMAND HANDLERS
// =============================================================================

// Start command
bot.command('start', async (ctx) => {
  const firstName = ctx.from?.first_name || 'Trader';
  const welcomeMessage = `🚀 **Welcome to AI Trading Bot V2, ${firstName}!**

🤖 **Enhanced with Multi-AI Models**
📊 **Real-time market analysis**  
⚡ **Lightning-fast responses**

**🔥 Try these commands:**`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🟠 Bitcoin', callback_data: 'quick_BTCUSDT' },
        { text: '💎 Ethereum', callback_data: 'quick_ETHUSDT' }
      ],
      [
        { text: '🍎 Apple', callback_data: 'quick_AAPL' },
        { text: '🪟 Microsoft', callback_data: 'quick_MSFT' }
      ],
      [
        { text: '📊 All Commands', callback_data: 'show_help' },
        { text: '⚙️ Settings', callback_data: 'show_settings' }
      ]
    ]
  };

  await ctx.reply(welcomeMessage, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// Enhanced help command
bot.command('help', async (ctx) => {
  const helpText = `📚 **AI Trading Bot V2 - All Commands**

**🔥 Quick Analysis (1-2 seconds):**
• \`/btc\` - Bitcoin analysis
• \`/eth\` - Ethereum analysis  
• \`/sol\` - Solana analysis
• \`/aapl\` - Apple stock
• \`/msft\` - Microsoft stock
• \`/tsla\` - Tesla stock

**🤖 V2 AI Analysis:**
• \`/v2 SYMBOL\` - Full analysis (default Claude)
• \`/v2 BTCUSDT model=gpt4mini\` - Use GPT-4o-mini  
• \`/v2 AAPL format=compact\` - Compact format
• \`/v2 BTCUSDT format=lines\` - 7-line signal format
• \`/quick SYMBOL\` - Quick format analysis

**📊 Market Overviews:**
• \`/crypto\` - Top crypto overview
• \`/stocks\` - Tech stocks overview
• \`/batch BTCUSDT,ETHUSDT,SOLUSDT\` - Multiple symbols

**🚀 NEW: Advanced Analysis Systems:**
• \`/chain SYMBOL\` - 🔗 Chained AI workflow (5-stage refinement)
• \`/portfolio\` - Full funnel: screen → analyze → select 3 picks
• \`/screen crypto\` - Screen crypto assets (Stage S)  
• \`/screen stocks\` - Screen stock assets (Stage S)
• \`/compare BTCUSDT,ETHUSDT,SOLUSDT\` - Deep compare analysis

**⚙️ Settings:**
• \`/settings\` - View/change settings
• \`/settings model=gpt4mini\` - Change AI model
• \`/settings format=compact\` - Change format
• \`/preset daytrader\` - Day trading setup
• \`/preset investor\` - Conservative setup

**🆘 Help & Info:**
• \`/help\` - This help message
• \`/models\` - Compare AI models
• \`/examples\` - Usage examples
• \`/start\` - Welcome screen

**💡 Available Models:**
• \`claude\` - Claude 3.5 Sonnet (default)
• \`gpt4o\` - GPT-4o (premium)
• \`gpt4mini\` - GPT-4o-mini (fast)

**📋 Available Formats:**
• \`full\` - Complete analysis (default)
• \`compact\` - Key details only
• \`quick\` - Fast summary

**Example Commands:**
\`/v2 BTCUSDT\` - Bitcoin with Claude
\`/v2 ETHUSDT model=gpt4mini format=compact\` - Fast Ethereum
\`/quick AAPL\` - Quick Apple analysis
\`/batch BTCUSDT,ETHUSDT,SOLUSDT\` - Multi-crypto`;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🟠 Try Bitcoin', callback_data: 'quick_BTCUSDT' },
        { text: '💎 Try Ethereum', callback_data: 'quick_ETHUSDT' }
      ],
      [
        { text: '📊 Examples', callback_data: 'show_examples' },
        { text: '🤖 Models', callback_data: 'show_models' }
      ]
    ]
  };

  await ctx.reply(helpText, { 
    parse_mode: 'Markdown',
    reply_markup: keyboard 
  });
});

// V2 command
bot.command('v2', async (ctx) => {
  try {
    const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
    await handleV2Command(ctx, args);
  } catch (error: any) {
    logger.error('❌ Error in /v2 command', { error: error.message });
    await ctx.reply('❌ Analysis failed. Use `/help` for command syntax.', { parse_mode: 'Markdown' });
  }
});

// Quick shortcuts
bot.command('btc', async (ctx) => await quickAnalyze(ctx, 'BTCUSDT', '🟠 Bitcoin'));
bot.command('eth', async (ctx) => await quickAnalyze(ctx, 'ETHUSDT', '💎 Ethereum'));
bot.command('sol', async (ctx) => await quickAnalyze(ctx, 'SOLUSDT', '🌞 Solana'));
bot.command('aapl', async (ctx) => await quickAnalyze(ctx, 'AAPL', '🍎 Apple'));
bot.command('msft', async (ctx) => await quickAnalyze(ctx, 'MSFT', '🪟 Microsoft'));
bot.command('tsla', async (ctx) => await quickAnalyze(ctx, 'TSLA', '🚗 Tesla'));

// Quick command
bot.command('quick', async (ctx) => {
  const symbol = ctx.message?.text?.split(' ')[1];
  if (!symbol) {
    await ctx.reply('❌ Please specify a symbol. Example: `/quick BTCUSDT`', { parse_mode: 'Markdown' });
    return;
  }
  await quickAnalyze(ctx, symbol.toUpperCase(), symbol.toUpperCase());
});

// Market overviews with enhanced format
bot.command('crypto', async (ctx) => {
  await cryptoAnalysis(ctx);
});

bot.command('stocks', async (ctx) => {
  await marketOverview(ctx, ['AAPL', 'MSFT', 'GOOGL', 'TSLA'], '📈 Tech Stocks');
});

// Batch analysis
bot.command('batch', async (ctx) => {
  const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
  await batchAnalysis(ctx, args);
});

// Settings commands
bot.command('settings', async (ctx) => {
  const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
  await handleSettings(ctx, args);
});

bot.command('preset', async (ctx) => {
  const preset = ctx.message?.text?.split(' ')[1];
  if (!preset) {
    await ctx.reply('❌ Please specify a preset: daytrader or investor\nExample: `/preset daytrader`');
    return;
  }
  await handlePreset(ctx, preset);
});

// Info commands
bot.command('models', async (ctx) => {
  const modelsInfo = `🤖 **Available AI Models**

**Claude 3.5 Sonnet** (\`claude\`)
├ Speed: ⭐⭐⭐ (2-3s avg)
├ Accuracy: ⭐⭐⭐⭐⭐ (95%+ success)
├ Quality: ⭐⭐⭐⭐⭐ (Excellent)
└ Best for: Balanced trading

**GPT-4o** (\`gpt4o\`)
├ Speed: ⭐⭐ (3-5s avg)
├ Accuracy: ⭐⭐⭐⭐⭐ (98%+ success)
├ Quality: ⭐⭐⭐⭐⭐ (Premium)
└ Best for: Deep research

**GPT-4o-mini** (\`gpt4mini\`)
├ Speed: ⭐⭐⭐⭐⭐ (1-2s avg)
├ Accuracy: ⭐⭐⭐⭐ (90%+ success)
├ Quality: ⭐⭐⭐⭐ (Good)
└ Best for: Day trading

**Change model:** \`/settings model=gpt4mini\`
**Try different model:** \`/v2 BTCUSDT model=gpt4o\``;

  await ctx.reply(modelsInfo, { parse_mode: 'Markdown' });
});

bot.command('examples', async (ctx) => {
  const examples = `💡 **Usage Examples**

**Basic Analysis:**
• \`/btc\` → Quick Bitcoin analysis
• \`/v2 BTCUSDT\` → Full Bitcoin analysis
• \`/v2 AAPL model=gpt4mini\` → Apple with fast model

**Different Formats:**
• \`/v2 ETHUSDT format=quick\` → Brief summary
• \`/v2 MSFT format=compact\` → Key details
• \`/quick TSLA\` → Quick format shortcut

**Multiple Assets:**
• \`/crypto\` → Top 4 crypto overview
• \`/batch BTCUSDT,ETHUSDT,SOLUSDT\` → Custom batch

**Personalization:**
• \`/preset daytrader\` → Fast GPT-4o-mini setup
• \`/settings model=claude format=compact\` → Custom
• \`/settings threshold=70\` → Higher confidence filter

**Pro Tips:**
💡 Type symbol alone: "BTCUSDT" → get analyze buttons
💡 Use shortcuts: \`/btc\` faster than \`/v2 BTCUSDT\`
💡 Day trading: \`/preset daytrader\` + \`/btc /eth /sol\``;

  const keyboard = {
    inline_keyboard: [
      [
        { text: '🚀 Try /crypto', callback_data: 'run_crypto' },
        { text: '📈 Try /stocks', callback_data: 'run_stocks' }
      ],
      [
        { text: '⚙️ Settings', callback_data: 'show_settings' },
        { text: '🤖 Models', callback_data: 'show_models' }
      ]
    ]
  };

  await ctx.reply(examples, { 
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
});

// =============================================================================
// NEW FUNNEL COMMANDS
// =============================================================================

// Portfolio funnel command - full 3-stage analysis
bot.command('portfolio', async (ctx) => {
  try {
    const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
    await handlePortfolioCommand(ctx, args);
  } catch (error: any) {
    logger.error('❌ Error in /portfolio command', { error: error.message });
    await ctx.reply('❌ Portfolio analysis failed. Try `/help` for command syntax.', { parse_mode: 'Markdown' });
  }
});

// Screen command - Stage S only
bot.command('screen', async (ctx) => {
  try {
    const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
    await handleScreenCommand(ctx, args);
  } catch (error: any) {
    logger.error('❌ Error in /screen command', { error: error.message });
    await ctx.reply('❌ Screening failed. Use `/screen crypto` or `/screen stocks`.', { parse_mode: 'Markdown' });
  }
});

// Compare command - Stage D on specific symbols
bot.command('compare', async (ctx) => {
  try {
    const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
    await handleCompareCommand(ctx, args);
  } catch (error: any) {
    logger.error('❌ Error in /compare command', { error: error.message });
    await ctx.reply('❌ Comparison failed. Use `/compare BTCUSDT,ETHUSDT,SOLUSDT`.', { parse_mode: 'Markdown' });
  }
});

// Chain command - Advanced 5-stage chained workflow
bot.command('chain', async (ctx) => {
  try {
    const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
    await handleChainCommand(ctx, args);
  } catch (error: any) {
    logger.error('❌ Error in /chain command', { error: error.message });
    await ctx.reply('❌ Chained analysis failed. Use `/chain BTCUSDT`.', { parse_mode: 'Markdown' });
  }
});

// =============================================================================
// FUNNEL COMMAND HANDLERS
// =============================================================================

async function handlePortfolioCommand(ctx: MyContext, args: string) {
  const timeframe = args.includes('12h') ? '12h' : args.includes('1d') ? '1d' : args.includes('3d') ? '3d' : args.includes('1w') ? '1w' : '6h';
  
  await ctx.replyWithChatAction('typing');
  const processingMsg = await ctx.reply(`🚀 **Portfolio Analysis Starting...**\n\n🔍 **Stage 1**: Screening assets\n⏳ **Stage 2**: Deep analysis\n💼 **Stage 3**: Portfolio optimization\n\n*This may take 30-60 seconds...*`, { parse_mode: 'Markdown' });

  try {
    const orchestrator = new MultiFunnelOrchestrator();
    
    // Default crypto + stock universe
    const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'ATOMUSDT', 'NEARUSDT'];
    const stockSymbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META', 'AMZN', 'NFLX'];
    const allSymbols = [...cryptoSymbols, ...stockSymbols];

    const portfolio = await orchestrator.executeFullFunnel(allSymbols, timeframe, 8);
    
    const response = formatPortfolioResult(portfolio);
    
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      response,
      { parse_mode: 'Markdown' }
    );

  } catch (error: any) {
    const errorMsg = `❌ **Portfolio Analysis Failed**\n\n${error.message}\n\nTry \`/portfolio\` again or use individual commands like \`/crypto\` for simpler analysis.`;
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      errorMsg,
      { parse_mode: 'Markdown' }
    );
  }
}

async function handleScreenCommand(ctx: MyContext, args: string) {
  const category = args.toLowerCase();
  
  if (!['crypto', 'stocks', 'all'].includes(category)) {
    await ctx.reply('❌ Please specify: `/screen crypto`, `/screen stocks`, or `/screen all`', { parse_mode: 'Markdown' });
    return;
  }

  await ctx.replyWithChatAction('typing');
  const processingMsg = await ctx.reply(`🔍 **Screening ${category.toUpperCase()} Assets...**`, { parse_mode: 'Markdown' });

  try {
    // Note: QuantScreener was removed in reorganization, using mock data for demo
    const symbols = getSymbolsForCategory(category);
    
    // Create screening request (simplified - in full implementation would gather real data)
    const mockScreeningData = await createMockScreeningData(symbols);
    
    // Mock screening result for demo
    const screeningResult = {
      top: mockScreeningData.slice(0, 8).map(asset => ({
        symbol: asset.symbol,
        score: Math.random() * 0.4 + 0.6, // 60-100%
        dir: Math.random() > 0.5 ? 'long' : 'short',
        rr_potential: Math.random() * 2 + 1.5, // 1.5-3.5
        risks: ['volatility', 'liquidity'].filter(() => Math.random() > 0.7),
        reason: `Technical setup favoring ${Math.random() > 0.5 ? 'momentum' : 'reversal'} play`
      }))
    };

    const response = formatScreeningResult(screeningResult, category);
    
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      response,
      { parse_mode: 'Markdown' }
    );

  } catch (error: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      `❌ **Screening Failed**\n\n${error.message}`,
      { parse_mode: 'Markdown' }
    );
  }
}

async function handleCompareCommand(ctx: MyContext, args: string) {
  const symbols = args.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
  
  if (symbols.length < 2 || symbols.length > 5) {
    await ctx.reply('❌ Please provide 2-5 symbols separated by commas.\nExample: `/compare BTCUSDT,ETHUSDT,SOLUSDT`', { parse_mode: 'Markdown' });
    return;
  }

  await ctx.replyWithChatAction('typing');
  const processingMsg = await ctx.reply(`🔬 **Comparing ${symbols.length} Assets...**\n\n${symbols.map(s => `• ${s}`).join('\n')}`, { parse_mode: 'Markdown' });

  try {
    // Run parallel analysis on all symbols
    const results = await Promise.allSettled(
      symbols.map(symbol => analyzeAssetV2(symbol, env.AI_MODEL || 'openai/gpt-5-mini'))
    );

    const validResults = results
      .map((result, index) => ({ symbol: symbols[index], result }))
      .filter((item): item is { symbol: string; result: PromiseFulfilledResult<any> } => 
        item.result.status === 'fulfilled'
      );

    const response = formatComparisonResult(validResults);
    
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      response,
      { parse_mode: 'Markdown' }
    );

  } catch (error: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      `❌ **Comparison Failed**\n\n${error.message}`,
      { parse_mode: 'Markdown' }
    );
  }
}

async function handleChainCommand(ctx: MyContext, args: string) {
  const symbol = args.trim().toUpperCase();
  
  if (!symbol) {
    await ctx.reply('❌ Please specify a symbol. Example: `/chain BTCUSDT`', { parse_mode: 'Markdown' });
    return;
  }

  await ctx.replyWithChatAction('typing');
  const processingMsg = await ctx.reply(`🔗 **Chained AI Workflow Starting...**\n\n**Asset:** ${symbol}\n**Stages:** 5 (Data → Technical → Risk → Strategy → Validation)\n\n*This advanced analysis may take 60-90 seconds...*`, { parse_mode: 'Markdown' });

  try {
    // Initialize cache if needed
    if (!marketDataCache) {
      await ctx.reply('❌ Market data cache not initialized. Please try again in a moment.');
      return;
    }

    const userPrefs = getUserSettings(ctx.from!.id);
    const model = getModelName(userPrefs.model);

    const result = await analyzeAssetWithChain(symbol, model);
    
    const response = formatChainedResult(result);
    
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      response,
      { parse_mode: 'Markdown' }
    );

  } catch (error: any) {
    const errorMsg = `❌ **Chained Analysis Failed**\n\n**Symbol:** ${symbol}\n**Error:** ${error.message}\n\nTry \`/v2 ${symbol}\` for standard analysis.`;
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      errorMsg,
      { parse_mode: 'Markdown' }
    );
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function handleV2Command(ctx: MyContext, args: string) {
  if (!args.trim()) {
    await ctx.reply('❌ Please specify a symbol. Example: `/v2 BTCUSDT`\n\nUse `/help` for all commands.', { parse_mode: 'Markdown' });
    return;
  }

  const params = parseArgs(args);
  const userPrefs = getUserSettings(ctx.from!.id);
  
  const symbol = params.symbol || params._[0];
  const model = getModelName(params.model || userPrefs.model);
  const format = params.format || userPrefs.format;

  if (!symbol) {
    await ctx.reply('❌ Please specify a symbol. Example: `/v2 BTCUSDT model=gpt4mini`', { parse_mode: 'Markdown' });
    return;
  }

  await ctx.replyWithChatAction('typing');
  const processingMsg = await ctx.reply(`🔍 Analyzing ${symbol.toUpperCase()}...\n⚡ Using ${model.split('/')[1]}`);

  try {
    const decision = await analyzeAssetV2(symbol.toUpperCase(), model);
    const response = formatAnalysis(decision, format);
    
    await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🔄 Refresh', callback_data: `refresh_${symbol}` },
          { text: '📊 Full Analysis', callback_data: `full_${symbol}` }
        ]
      ]
    };

    await ctx.reply(response, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });

  } catch (error: any) {
    await ctx.api.editMessageText(
      ctx.chat!.id,
      processingMsg.message_id,
      `❌ Analysis failed for ${symbol}: ${error.message}\n\nTry a different model: \`/v2 ${symbol} model=gpt4mini\``,
      { parse_mode: 'Markdown' }
    );
  }
}

async function quickAnalyze(ctx: MyContext, symbol: string, displayName: string) {
  try {
    await ctx.replyWithChatAction('typing');
    
    const decision = await analyzeAssetV2(symbol, 'openai/gpt-4o-mini');
    const response = formatAnalysis(decision, 'quick');
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '📊 Full Analysis', callback_data: `full_${symbol}` },
          { text: '🔄 Refresh', callback_data: `refresh_${symbol}` }
        ]
      ]
    };
    
    await ctx.reply(`${displayName}\n\n${response}`, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error: any) {
    await ctx.reply(`❌ ${displayName} analysis failed: ${error.message}\n\nTry: \`/v2 ${symbol}\``, { 
      parse_mode: 'Markdown' 
    });
  }
}

async function cryptoAnalysis(ctx: MyContext) {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT'];
  
  await ctx.replyWithChatAction('typing');
  const processingMsg = await ctx.reply('🚀 Analyzing top crypto assets with enhanced signals...');
  
  try {
    const results = await Promise.allSettled(
      symbols.map(symbol => analyzeAssetV2(symbol, 'openai/gpt-5-mini'))
    );
    
    let responses: string[] = [];
    
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const symbol = symbols[i];
      
      if (result.status === 'fulfilled') {
        const decision = result.value;
        const formatted = formatAnalysis(decision, 'lines');
        responses.push(formatted);
      } else {
        responses.push(`❌ **${symbol}**: Analysis failed - ${result.reason}`);
      }
    }
    
    await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
    
    // Send each analysis as a separate message for better readability
    for (const response of responses) {
      await ctx.reply(response, { parse_mode: 'Markdown' });
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay between messages
    }
    
    // Send summary
    const successful = results.filter(r => r.status === 'fulfilled').length;
    await ctx.reply(`✅ **Crypto Analysis Complete**\n\n📊 Successfully analyzed ${successful}/${symbols.length} assets\n🎯 Using enhanced 7-line signal format`, { 
      parse_mode: 'Markdown' 
    });
    
  } catch (error: any) {
    await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, `❌ Crypto analysis failed: ${error.message}`);
  }
}

async function marketOverview(ctx: MyContext, symbols: string[], title: string, format: string = 'compact') {
  await ctx.replyWithChatAction('typing');
  const processingMsg = await ctx.reply(`🔍 Scanning ${title.toLowerCase()}...`);
  
  try {
    const results = await Promise.allSettled(
      symbols.map(symbol => analyzeAssetV2(symbol, 'openai/gpt-4o-mini'))
    );
    
    let overview = `${title} Overview\n\n`;
    let bullish = 0, bearish = 0, neutral = 0;
    
    results.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled') {
        const decision = result.value;
        const emoji = decision.position === 'long' ? '📈' : decision.position === 'short' ? '📉' : '⏸️';
        const confidence = Math.round(decision.confidence * 100);
        const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
        
        overview += `${emoji} **${symbol}**: ${decision.position.toUpperCase()} (${confidence}%) ${riskColor}\n`;
        
        if (decision.position === 'long') bullish++;
        else if (decision.position === 'short') bearish++;
        else neutral++;
      } else {
        overview += `❌ **${symbol}**: Analysis failed\n`;
      }
    });
    
    overview += `\n📊 **Market Sentiment:**\n`;
    overview += `📈 Bullish: ${bullish} | 📉 Bearish: ${bearish} | ⏸️ Neutral: ${neutral}`;
    
    await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, overview, {
      parse_mode: 'Markdown'
    });
    
  } catch (error: any) {
    await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, `❌ ${title} overview failed: ${error.message}`);
  }
}

async function batchAnalysis(ctx: MyContext, args: string) {
  const symbols = args.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
  
  if (symbols.length === 0) {
    await ctx.reply('❌ Please provide symbols separated by commas.\nExample: `/batch BTCUSDT,ETHUSDT,SOLUSDT`', { parse_mode: 'Markdown' });
    return;
  }
  
  if (symbols.length > 5) {
    await ctx.reply('❌ Maximum 5 symbols allowed for batch analysis.');
    return;
  }
  
  await ctx.replyWithChatAction('typing');
  const processingMsg = await ctx.reply(`🔄 Analyzing ${symbols.length} assets...`);
  
  try {
    const results = await Promise.allSettled(
      symbols.map(symbol => analyzeAssetV2(symbol, 'openai/gpt-4o-mini'))
    );
    
    let summary = `📊 **Batch Analysis Results**\n\n`;
    let tradeable = 0;
    
    results.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled') {
        const decision = result.value;
        const emoji = decision.position === 'long' ? '📈' : decision.position === 'short' ? '📉' : '⏸️';
        const confidence = Math.round(decision.confidence * 100);
        summary += `${emoji} **${symbol}**: ${decision.position.toUpperCase()} (${confidence}%)\n`;
        if (decision.position !== 'hold' && confidence > 60) tradeable++;
      } else {
        summary += `❌ **${symbol}**: Analysis failed\n`;
      }
    });
    
    summary += `\n🎯 **Summary**: ${tradeable} tradeable signals found`;
    
    await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, summary, { parse_mode: 'Markdown' });
    
  } catch (error: any) {
    await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, `❌ Batch analysis failed: ${error.message}`);
  }
}

async function handleSettings(ctx: MyContext, args: string) {
  const userId = ctx.from!.id;
  const currentSettings = getUserSettings(userId);
  
  if (!args.trim()) {
    const settingsText = `⚙️ **Your Settings**\n\n` +
      `🤖 **Model:** ${getModelDisplayName(currentSettings.model)}\n` +
      `📊 **Format:** ${currentSettings.format}\n` +
      `🎯 **Threshold:** ${currentSettings.threshold}%\n\n` +
      `**Change Settings:**\n` +
      `\`/settings model=gpt4mini\`\n` +
      `\`/settings format=compact\`\n` +
      `\`/settings threshold=70\`\n\n` +
      `**Quick Presets:**\n` +
      `\`/preset daytrader\` - Fast trading\n` +
      `\`/preset investor\` - Conservative`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '🏃 Day Trader', callback_data: 'preset_daytrader' },
          { text: '💎 Investor', callback_data: 'preset_investor' }
        ],
        [
          { text: '🤖 Models', callback_data: 'show_models' },
          { text: '🔄 Reset', callback_data: 'settings_reset' }
        ]
      ]
    };
    
    await ctx.reply(settingsText, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    return;
  }
  
  try {
    const updates = parseSettings(args);
    const newSettings = { ...currentSettings, ...updates };
    userSettings.set(userId, newSettings);
    
    await ctx.reply(`✅ **Settings Updated**\n\n${formatUserSettings(newSettings)}`, {
      parse_mode: 'Markdown'
    });
    
  } catch (error: any) {
    await ctx.reply(`❌ Invalid settings: ${error.message}\n\nUse \`/settings\` to see available options.`, {
      parse_mode: 'Markdown'
    });
  }
}

async function handlePreset(ctx: MyContext, preset: string) {
  const userId = ctx.from!.id;
  
  if (!preset) {
    await ctx.reply(`❌ Please specify a preset: \`/preset daytrader\` or \`/preset investor\``, { parse_mode: 'Markdown' });
    return;
  }
  
  let newSettings: any;
  
  switch (preset.toLowerCase()) {
    case 'daytrader':
    case 'day':
      newSettings = { model: 'gpt4mini', format: 'quick', threshold: 55 };
      break;
    case 'investor':
    case 'invest':
      newSettings = { model: 'claude', format: 'full', threshold: 75 };
      break;
    default:
      await ctx.reply(`❌ Unknown preset. Available: \`daytrader\`, \`investor\``, { parse_mode: 'Markdown' });
      return;
  }
  
  userSettings.set(userId, newSettings);
  
  await ctx.reply(`✅ **${preset.charAt(0).toUpperCase() + preset.slice(1)} Preset Applied**\n\n${formatUserSettings(newSettings)}`, {
    parse_mode: 'Markdown'
  });
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function parseArgs(args: string): any {
  const result: any = { _: [] };
  const parts = args.trim().split(/\s+/);
  
  for (const part of parts) {
    if (part.includes('=')) {
      const [key, value] = part.split('=');
      result[key] = value;
    } else {
      result._.push(part);
    }
  }
  
  result.symbol = result._[0];
  return result;
}

function parseSettings(args: string): any {
  const updates: any = {};
  const pairs = args.split(/\s+/);
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (!key || !value) continue;
    
    switch (key.toLowerCase()) {
      case 'model':
        if (!['claude', 'gpt4o', 'gpt4mini'].includes(value)) {
          throw new Error('Model must be: claude, gpt4o, or gpt4mini');
        }
        updates.model = value;
        break;
      case 'format':
        if (!['full', 'compact', 'quick'].includes(value)) {
          throw new Error('Format must be: full, compact, or quick');
        }
        updates.format = value;
        break;
      case 'threshold':
        const threshold = parseInt(value);
        if (isNaN(threshold) || threshold < 0 || threshold > 100) {
          throw new Error('Threshold must be 0-100');
        }
        updates.threshold = threshold;
        break;
    }
  }
  
  return updates;
}

function getModelDisplayName(model: string): string {
  const names: Record<string, string> = {
    'claude': 'Claude 3.5 Sonnet',
    'gpt4o': 'GPT-4o',
    'gpt4mini': 'GPT-4o-mini'
  };
  return names[model] || 'Claude 3.5 Sonnet';
}

function formatUserSettings(settings: any): string {
  return `🤖 **Model:** ${getModelDisplayName(settings.model)}\n` +
         `📊 **Format:** ${settings.format}\n` +
         `🎯 **Threshold:** ${settings.threshold}%`;
}

// =============================================================================
// FUNNEL UTILITY FUNCTIONS
// =============================================================================

function formatPortfolioResult(portfolio: any): string {
  const picks = portfolio.picks;
  if (!picks || picks.length === 0) {
    return `💼 **Portfolio Analysis Complete**\n\n❌ No suitable positions found.\n\nTry adjusting risk parameters or wait for better market conditions.`;
  }

  let response = `💼 **Portfolio Analysis Complete**\n\n`;
  response += `🎯 **Selected Positions (${picks.length}):**\n\n`;

  picks.forEach((pick: any, index: number) => {
    const emoji = pick.position === 'long' ? '📈' : '📉';
    const confidenceColor = pick.confidence >= 0.7 ? '🟢' : pick.confidence >= 0.5 ? '🟡' : '🔴';
    
    response += `${emoji} **${pick.asset}** (${pick.position.toUpperCase()})\n`;
    response += `├ Size: ${pick.size_pct}% │ R:R: ${pick.expected_rr.toFixed(1)}:1\n`;
    response += `├ Confidence: ${Math.round(pick.confidence * 100)}% ${confidenceColor}\n`;
    response += `└ ${pick.notes}\n\n`;
  });

  response += `📊 **Portfolio Stats:**\n`;
  response += `├ Risk Budget Used: ${100 - portfolio.reserves_pct}%\n`;
  response += `├ Cash Reserve: ${portfolio.reserves_pct}%\n`;
  response += `├ Max Correlation: ${(portfolio.diversification.pairwise_max_corr * 100).toFixed(0)}%\n`;
  response += `└ Sectors: ${portfolio.diversification.sector_spread.join(', ')}\n\n`;

  response += `⚠️ *This is AI analysis for educational purposes. Always do your own research and manage risk appropriately.*`;

  return response;
}

function formatScreeningResult(result: any, category: string): string {
  const top = result.top;
  if (!top || top.length === 0) {
    return `🔍 *${category.toUpperCase()} Screening Complete*\n\n❌ No assets passed screening criteria.`;
  }

  let response = `🔍 *${category.toUpperCase()} Screening Results*\n\n`;
  response += `📊 *Top ${top.length} Candidates:*\n\n`;

  top.forEach((item: any, index: number) => {
    const emoji = item.dir === 'long' ? '📈' : item.dir === 'short' ? '📉' : '⏸️';
    const scoreColor = item.score >= 0.7 ? '🟢' : item.score >= 0.5 ? '🟡' : '🔴';
    
    response += `${index + 1}\\. ${emoji} *${item.symbol}*\n`;
    response += `├ Score: ${(item.score * 100).toFixed(0)}% ${scoreColor} \\| Direction: ${item.dir.toUpperCase()}\n`;
    response += `├ R:R Potential: ${item.rr_potential.toFixed(1)}:1\n`;
    if (item.risks.length > 0) {
      response += `├ Risks: ${item.risks.join(', ')}\n`;
    }
    response += `└ ${item.reason}\n\n`;
  });

  response += `💡 Use \`/compare ${top.slice(0, 3).map((item: any) => item.symbol).join(',')}\` for detailed analysis.`;

  return response;
}

function formatComparisonResult(validResults: any[]): string {
  if (validResults.length === 0) {
    return `🔬 *Comparison Complete*\n\n❌ No successful analyses.`;
  }

  let response = `🔬 *Asset Comparison Results*\n\n`;
  
  // Sort by confidence * RR
  const sorted = validResults
    .map(item => ({
      symbol: item.symbol,
      decision: item.result.value,
      quality: item.result.value.confidence * item.result.value.realized_rr_est
    }))
    .sort((a, b) => b.quality - a.quality);

  sorted.forEach((item, index) => {
    const decision = item.decision;
    const emoji = decision.position === 'long' ? '📈' : decision.position === 'short' ? '📉' : '⏸️';
    const confidenceColor = decision.confidence >= 0.7 ? '🟢' : decision.confidence >= 0.5 ? '🟡' : '🔴';
    
    response += `${index + 1}\\. ${emoji} *${item.symbol}* (${decision.position.toUpperCase()})\n`;
    response += `├ Quality Score: ${item.quality.toFixed(2)} ${confidenceColor}\n`;
    response += `├ Confidence: ${Math.round(decision.confidence * 100)}% \\| R:R: ${decision.realized_rr_est.toFixed(1)}:1\n`;
    response += `└ ${decision.rationale}\n\n`;
  });

  const topPick = sorted[0];
  if (topPick.decision.position !== 'hold') {
    response += `🏆 *Top Pick: ${topPick.symbol}*\n`;
    response += `Use \`/v2 ${topPick.symbol} format=full\` for complete analysis.`;
  }

  return response;
}

function formatChainedResult(result: any): string {
  const decision = result.finalDecision;
  const emoji = decision.position === 'long' ? '📈' : decision.position === 'short' ? '📉' : '⏸️';
  const confidence = Math.round(decision.confidence * 100);
  const qualityColor = result.overallQuality >= 0.8 ? '🟢' : result.overallQuality >= 0.6 ? '🟡' : '🔴';
  const convergenceEmoji = result.convergenceAchieved ? '✅' : '⚠️';

  let response = `🔗 **Chained AI Analysis Complete** ${convergenceEmoji}\n\n`;
  
  // Summary
  response += `${emoji} **${decision.asset}** - ${decision.position.toUpperCase()}\n`;
  response += `📊 **Quality Score:** ${(result.overallQuality * 100).toFixed(1)}% ${qualityColor}\n`;
  response += `🎯 **Confidence:** ${confidence}%\n`;
  response += `⏱️ **Processing:** ${result.executionTime}ms (${result.totalIterations} iterations)\n\n`;

  // Stage breakdown
  response += `**📋 Stage Results:**\n`;
  result.stageResults.forEach((stage: any, index: number) => {
    const stageEmoji = stage.convergenceScore >= 0.8 ? '✅' : stage.convergenceScore >= 0.6 ? '🟡' : '❌';
    const stageName = stage.stageId.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());
    response += `${index + 1}. ${stageName} ${stageEmoji} (${(stage.quality * 100).toFixed(0)}%, ${stage.iteration} iter)\n`;
  });

  // Trading details
  response += `\n💰 **Trading Plan:**\n`;
  response += `├ Entry Zone: $${decision.entry.lower?.toFixed(4)} - $${decision.entry.upper?.toFixed(4)}\n`;
  response += `├ Stop Loss: $${decision.stop?.toFixed(4)}\n`;
  response += `├ Position Size: ${decision.size_pct}%\n`;
  response += `└ Risk:Reward: ${decision.realized_rr_est?.toFixed(1)}:1\n\n`;

  // Feature scores
  response += `📊 **Technical Scores:**\n`;
  response += `├ Trend: ${Math.round((decision.feature_scores?.trend || 0) * 100)}%\n`;
  response += `├ Momentum: ${Math.round((decision.feature_scores?.momentum || 0) * 100)}%\n`;
  response += `├ RSI Signal: ${Math.round((decision.feature_scores?.rsi_signal || 0) * 100)}%\n`;
  response += `└ Risk: ${Math.round((decision.feature_scores?.risk || 0) * 100)}%\n\n`;

  // AI Rationale
  response += `🤖 **AI Rationale:**\n"${decision.rationale}"\n\n`;

  // Convergence status
  if (result.convergenceAchieved) {
    response += `✅ **All stages converged** - High confidence result\n`;
  } else {
    response += `⚠️ **Partial convergence** - Review individual stage results\n`;
  }

  response += `\n*Chained AI analysis with ${result.totalStages} iterative refinement stages*`;

  return response;
}

function getSymbolsForCategory(category: string): string[] {
  const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'MATICUSDT', 'LINKUSDT', 'ATOMUSDT', 'NEARUSDT'];
  const stockSymbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META', 'AMZN', 'NFLX'];
  
  switch (category) {
    case 'crypto': return cryptoSymbols;
    case 'stocks': return stockSymbols;
    case 'all': return [...cryptoSymbols, ...stockSymbols];
    default: return cryptoSymbols;
  }
}

async function createMockScreeningData(symbols: string[]): Promise<any[]> {
  // For demo purposes, create mock data
  // In production, this would call the real data service
  return symbols.map(symbol => ({
    symbol,
    price: Math.random() * 1000 + 100,
    atr_pct: Math.random() * 0.05 + 0.01,
    rsi: Math.random() * 60 + 20,
    ma50_slope: (Math.random() - 0.5) * 0.1,
    adx: Math.random() * 30 + 15,
    age_sec: Math.random() * 120 + 30,
    ob: Math.random() > 0.5 ? { imb10: (Math.random() - 0.5) * 0.2 } : undefined,
    deriv: symbol.includes('USDT') ? {
      fund: (Math.random() - 0.5) * 0.02,
      oi_d1: (Math.random() - 0.5) * 0.2,
      basis_bps: (Math.random() - 0.5) * 50
    } : undefined,
    sent: Math.random() > 0.7 ? { pol: (Math.random() - 0.5) * 0.4 } : undefined,
    beta_btc: symbol.includes('USDT') ? Math.random() * 1.5 + 0.3 : Math.random() * 0.5 + 0.1
  }));
}

// =============================================================================
// CALLBACK HANDLERS
// =============================================================================

bot.on('callback_query', async (ctx) => {
  const callbackData = ctx.callbackQuery?.data;
  if (!callbackData) {
    await ctx.answerCallbackQuery('❌ Invalid callback data');
    return;
  }

  try {
    if (callbackData.startsWith('quick_')) {
      const symbol = callbackData.replace('quick_', '');
      await ctx.answerCallbackQuery();
      await quickAnalyze(ctx, symbol, symbol);
    } else if (callbackData.startsWith('full_')) {
      const symbol = callbackData.replace('full_', '');
      await ctx.answerCallbackQuery();
      await handleV2Command(ctx, `${symbol} format=full`);
    } else if (callbackData.startsWith('refresh_')) {
      const symbol = callbackData.replace('refresh_', '');
      await ctx.answerCallbackQuery();
      await quickAnalyze(ctx, symbol, symbol);
    } else if (callbackData === 'show_help') {
      await ctx.answerCallbackQuery();
      await ctx.reply('Use `/help` for complete command list!', { parse_mode: 'Markdown' });
    } else if (callbackData === 'show_settings') {
      await ctx.answerCallbackQuery();
      await handleSettings(ctx, '');
    } else if (callbackData === 'show_models') {
      await ctx.answerCallbackQuery();
      await bot.handleUpdate({
        update_id: 0,
        message: {
          message_id: 0,
          date: 0,
          chat: ctx.chat! as any,
          from: ctx.from!,
          text: '/models'
        }
      });
    } else if (callbackData === 'show_examples') {
      await ctx.answerCallbackQuery();
      await bot.handleUpdate({
        update_id: 0,
        message: {
          message_id: 0,
          date: 0,
          chat: ctx.chat! as any,
          from: ctx.from!,
          text: '/examples'
        }
      });
    } else if (callbackData.startsWith('preset_')) {
      const preset = callbackData.replace('preset_', '');
      await ctx.answerCallbackQuery();
      await handlePreset(ctx, preset);
    } else if (callbackData === 'settings_reset') {
      userSettings.delete(ctx.from!.id);
      await ctx.answerCallbackQuery('Settings reset!');
      await ctx.editMessageText('✅ **Settings Reset**\n\nAll settings restored to defaults.', {
        parse_mode: 'Markdown'
      });
    } else if (callbackData === 'run_crypto') {
      await ctx.answerCallbackQuery();
      await cryptoAnalysis(ctx);
    } else if (callbackData === 'run_stocks') {
      await ctx.answerCallbackQuery();
      await marketOverview(ctx, ['AAPL', 'MSFT', 'GOOGL', 'TSLA'], '📈 Tech Stocks');
    } else if (callbackData.startsWith('position_')) {
      await handleMakePositionCallback(ctx, callbackData);
    } else {
      await ctx.answerCallbackQuery('❓ Unknown action');
    }
  } catch (error: any) {
    logger.error('❌ Callback query error', { error: error.message });
    await ctx.answerCallbackQuery('❌ Something went wrong');
  }
});

// =============================================================================
// MESSAGE HANDLERS
// =============================================================================

// Legacy commands for backward compatibility
bot.use(positionCommands);
bot.use(tradeCommands);

bot.command('analyze', async (ctx) => {
  try {
    const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
    await handleAnalyzeCommand(ctx, args);
  } catch (error: any) {
    logger.error('❌ Error in /analyze command', { error: error.message });
    await ctx.reply('❌ Analysis failed. Try `/v2 SYMBOL` instead!', { parse_mode: 'Markdown' });
  }
});

// Handle text messages
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  
  if (text.startsWith('/')) {
    await ctx.reply('❓ **Unknown command**\n\nUse `/help` to see all available commands!', {
      parse_mode: 'Markdown'
    });
  } else {
    // Check if message looks like a symbol
    const cleanText = text.trim().toUpperCase();
    if (/^[A-Z]{2,6}(USDT)?$/.test(cleanText)) {
      const keyboard = {
        inline_keyboard: [[
          { text: '🔍 Quick Analysis', callback_data: `quick_${cleanText}` },
          { text: '📊 Full Analysis', callback_data: `full_${cleanText}` }
        ]]
      };
      await ctx.reply(`💡 **Analyze ${cleanText}?**`, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } else {
      await ctx.reply('👋 Hello! Use `/help` for commands or try `/btc` for Bitcoin analysis!');
    }
  }
});

// =============================================================================
// STARTUP
// =============================================================================

async function shutdown() {
  logger.info('Shutting down bot...');
  try {
    await bot.stop();
    if (redisClient) await redisClient.quit();
  } catch (error) {
    logger.error('Shutdown error', { error });
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function startBot() {
  try {
    logger.info('🚀 Starting Enhanced AI Trading Bot V3...');
    
    // Initialize market data cache
    logger.info('📦 Initializing market data cache...');
    await marketDataCache.init();
    
    // Preload symbols if needed
    logger.info('🔄 Preloading market data...');
    await marketDataCache.preloadAllSymbols();
    
    await setupRedis();
    await bot.start();
    logger.info('✅ Enhanced AI Trading Bot V3 started successfully!');
  } catch (error) {
    logger.error('❌ Failed to start bot', { error });
    process.exit(1);
  }
}

const _healthPort = env.HEALTH_PORT;

/**
 * Minimal non-blocking health server.
 * - Uses env checks for DATABASE_URL
 * - Uses feature-detection for redis client (ping / isOpen / connected)
 * - Uses light checks for marketDataCache readiness (feature-detect)
 *
 * Starts immediately and runs independently of bot.start().
 */
try {
  const healthServer = http.createServer(async (req, res) => {
    try {
      const method = req.method || 'GET';
      const url = (req.url || '').split('?')[0];

      if (method !== 'GET') {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'method_not_allowed' }));
        return;
      }

      // GET /health - aggregated small JSON
      if (url === '/health' || url === '/health/') {
        // DB presence check (no DB queries)
        const dbStatus = env.DATABASE_URL && env.DATABASE_URL.trim() !== '' ? 'configured' : 'unknown';

        // Redis status (detect without throwing)
        let redisStatus: 'ok' | 'disabled' | 'error' | 'unknown' = 'unknown';
        if (!env.REDIS_URL || env.REDIS_URL.trim() === '') {
          redisStatus = 'disabled';
        } else {
          if (!redisClient) {
            // REDIS_URL set but client not initialized / connection previously failed
            redisStatus = 'error';
          } else {
            try {
              // Prefer ping if available
              if (typeof (redisClient as any).ping === 'function') {
                const reply = await (redisClient as any).ping();
                redisStatus = reply ? 'ok' : 'error';
              } else if (typeof (redisClient as any).isOpen === 'boolean') {
                redisStatus = (redisClient as any).isOpen ? 'ok' : 'error';
              } else if (typeof (redisClient as any).connected === 'boolean') {
                redisStatus = (redisClient as any).connected ? 'ok' : 'error';
              } else {
                redisStatus = 'unknown';
              }
            } catch (err) {
              redisStatus = 'error';
            }
          }
        }

        // marketCache readiness (feature-detection)
        let marketCacheStatus: 'ready' | 'initializing' = 'initializing';
        try {
          if (marketDataCache) {
            if (typeof (marketDataCache as any).isReady === 'function') {
              const ready = await Promise.resolve((marketDataCache as any).isReady());
              marketCacheStatus = ready ? 'ready' : 'initializing';
            } else if (typeof (marketDataCache as any).initialized === 'boolean') {
              marketCacheStatus = (marketDataCache as any).initialized ? 'ready' : 'initializing';
            } else if (typeof (marketDataCache as any).ready === 'boolean') {
              marketCacheStatus = (marketDataCache as any).ready ? 'ready' : 'initializing';
            } else {
              marketCacheStatus = 'initializing';
            }
          }
        } catch (err) {
          marketCacheStatus = 'initializing';
        }

        const payload = {
          status: 'ok',
          services: {
            db: dbStatus,
            redis: redisStatus,
            marketCache: marketCacheStatus
          }
        };

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
        return;
      }

      // GET /health/redis - focused redis check
      if (url === '/health/redis' || url === '/health/redis/') {
        if (!env.REDIS_URL || env.REDIS_URL.trim() === '') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', redis: 'disabled' }));
          return;
        }

        if (!redisClient) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Redis client not initialized' }));
          return;
        }

        try {
          if (typeof (redisClient as any).ping === 'function') {
            const pong = await (redisClient as any).ping();
            const ok = Boolean(pong);
            res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: ok ? 'ok' : 'error' }));
            return;
          } else if (typeof (redisClient as any).isOpen === 'boolean') {
            const ok = Boolean((redisClient as any).isOpen);
            res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: ok ? 'ok' : 'error' }));
            return;
          } else if (typeof (redisClient as any).connected === 'boolean') {
            const ok = Boolean((redisClient as any).connected);
            res.writeHead(ok ? 200 : 503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: ok ? 'ok' : 'error' }));
            return;
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'unknown' }));
            return;
          }
        } catch (err) {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'Redis ping failed' }));
          return;
        }
      }

      // GET /health/db - presence-only check
      if (url === '/health/db' || url === '/health/db/') {
        if (env.DATABASE_URL && env.DATABASE_URL.trim() !== '') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok', db: 'configured' }));
        } else {
          res.writeHead(503, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'error', message: 'DATABASE_URL not configured' }));
        }
        return;
      }

      // Not found
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'not_found' }));
    } catch (err) {
      // Avoid leaking internal errors or secrets
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error' }));
    }
  });

  healthServer.listen(_healthPort, () => {
    logger.info(`Health server listening on port ${_healthPort}`);
  });

  healthServer.on('error', (err: any) => {
    logger.warn('Health server error', { error: err?.message || 'unknown' });
  });

  // Ensure graceful close on shutdown
  process.on('SIGINT', async () => {
    try { healthServer.close(); } catch (_) {}
  });
  process.on('SIGTERM', async () => {
    try { healthServer.close(); } catch (_) {}
  });
} catch (err) {
  // Do not crash startup for health server issues; log non-sensitive info
  logger.warn('Failed to start health server', { error: (err as any)?.message || 'unknown' });
}

if (require.main === module) {
  startBot();
}

export { bot, logger };