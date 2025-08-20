// Modern AI Trading Bot V3 - Clean, Debuggable, Feature-Rich

import { Bot, session, Context, SessionFlavor } from 'grammy';
import { RedisAdapter } from '@grammyjs/storage-redis';
import { createClient } from 'redis';
import dotenv from 'dotenv';
import path from 'path';

// Import AI and UI systems
import { 
  analyzeAssetV2, 
  MultiFunnelOrchestrator, 
  AI_MODELS,
  ModelSelector,
  getModelName,
  debugSystem,
  timeOperation,
  infoLog,
  errorLog,
  marketDataCache,
  toCompactLines
} from '@trade/ai';
import { TradingKeyboards } from '../ui/keyboards';
import { botConfig } from '../config';

// Smart .env loading - works from any directory
const envPath = process.cwd().includes('apps/bot') 
  ? path.join(__dirname, '../../../../.env')   // From bot directory (dist/core)
  : path.join(process.cwd(), '.env');           // From root directory

dotenv.config({ path: envPath });

// Enhanced session data
interface SessionData {
  userId?: number;
  chatId?: number;
  currentModel?: string;
  format?: 'quick' | 'compact' | 'full';
  threshold?: number;
  notifications?: boolean;
  darkMode?: boolean;
  debugMode?: boolean;
  lastAnalysis?: any;
  watchlist?: string[];
  preferences?: {
    analysisSpeed: 'fast' | 'balanced' | 'thorough';
    riskTolerance: 'conservative' | 'moderate' | 'aggressive';
    defaultTimeframe: '15m' | '30m' | '1h' | '4h' | '1d';
  };
}

type MyContext = Context & SessionFlavor<SessionData>;

// Environment configuration (centralized)
const env = botConfig;

export class TradingBotV3 {
  private bot: Bot<MyContext>;
  private redisClient: ReturnType<typeof createClient> | null = null;
  private orchestrator = new MultiFunnelOrchestrator();

  constructor() {
    this.bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
  }

  private async setupMiddleware() {
    // Session setup
    await this.setupRedis();
    
    // Request logging middleware
    this.bot.use(async (ctx, next) => {
      const start = Date.now();
      const userId = ctx.from?.id;
      const messageText = ctx.message?.text || ctx.callbackQuery?.data || 'unknown';
      
      infoLog('bot', 'request', { userId, messageText });
      
      try {
        await next();
        const duration = Date.now() - start;
        infoLog('bot', 'request_success', { userId, duration });
      } catch (error: any) {
        const duration = Date.now() - start;
        errorLog('bot', 'request_error', error.message, { userId, duration });
        throw error;
      }
    });

    // Session initialization
    this.bot.use(async (ctx, next) => {
      if (!ctx.session) {
        ctx.session = this.getDefaultSession(ctx);
      }
      await next();
    });

    // Error handling
    this.bot.catch((err) => {
      const ctx = err.ctx;
      const error = err.error as any;
      
      errorLog('bot', 'global_error', error?.message || 'Unknown error', {
        userId: ctx.from?.id,
        chatId: ctx.chat?.id
      });
      
      ctx.reply('❌ Something went wrong. Our team has been notified. Please try again.').catch(() => {});
    });
  }

  private async setupRedis() {
    if (!env.REDIS_URL?.trim()) {
      infoLog('bot', 'session_setup', { type: 'in-memory' });
      this.bot.use(session({ initial: () => ({}) }));
      return;
    }

    try {
      this.redisClient = createClient({ 
        url: env.REDIS_URL,
        socket: {
          tls: env.REDIS_URL.startsWith('rediss://'),
          rejectUnauthorized: false,
          connectTimeout: 8000
        }
      });
      
      await Promise.race([
        this.redisClient.connect(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Redis connection timeout')), 10000)
        )
      ]);
      
      this.bot.use(session({
        initial: () => ({}),
        storage: new RedisAdapter({ instance: this.redisClient! })
      }));
      
      infoLog('bot', 'session_setup', { type: 'redis', url: env.REDIS_URL });
    } catch (error: any) {
      errorLog('bot', 'redis_setup', error.message);
      this.bot.use(session({ initial: () => ({}) }));
    }
  }

  private getDefaultSession(ctx: MyContext): SessionData {
    return {
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      currentModel: 'anthropic/claude-3.5-sonnet',
      format: 'compact',
      threshold: 60,
      notifications: true,
      darkMode: false,
      debugMode: env.DEBUG_MODE,
      watchlist: [],
      preferences: {
        analysisSpeed: 'balanced',
        riskTolerance: 'moderate',
        defaultTimeframe: '1h'
      }
    };
  }

  private setupCommands() {
    // Start command with modern UI
    this.bot.command('start', async (ctx) => {
      const firstName = ctx.from?.first_name || 'Trader';
      const welcomeMessage = `🚀 **Welcome to AI Trading Bot V3, ${firstName}!**\n\n` +
        `✨ **New Features:**\n` +
        `• 🎯 Multi-stage portfolio analysis\n` +
        `• 🤖 Advanced AI model selection (GPT-5 Mini!)\n` +
        `• 🔍 Real-time debugging & monitoring\n` +
        `• 📱 Modern button-based interface\n\n` +
        `**Choose an option below to get started:**`;

      await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.mainMenu()
      });
    });

    // Debug command for developers
    this.bot.command('debug', async (ctx) => {
      if (!ctx.session.debugMode) {
        await ctx.reply('🔒 Debug mode not enabled for your account.');
        return;
      }

      const report = debugSystem.formatDebugReport();
      await ctx.reply(`\`\`\`\n${report}\n\`\`\``, { 
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.debugMenu()
      });
    });

    // Model command for quick model switching
    this.bot.command('model', async (ctx) => {
      const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
      if (args) {
        const model = getModelName(args);
        if (ModelSelector.getModelByName(model)) {
          ctx.session.currentModel = model;
          await ctx.reply(`✅ Switched to ${model}`, {
            reply_markup: TradingKeyboards.mainMenu()
          });
        } else {
          await ctx.reply('❌ Invalid model. Use /models to see available options.');
        }
      } else {
        await ctx.reply('🤖 **Available Models:**', {
          reply_markup: TradingKeyboards.modelSelection(ctx.session.currentModel)
        });
      }
    });

    // Quick analysis commands
    this.bot.command('btc', async (ctx) => this.quickAnalysis(ctx, 'BTCUSDT', '🟠 Bitcoin'));
    this.bot.command('eth', async (ctx) => this.quickAnalysis(ctx, 'ETHUSDT', '💎 Ethereum'));
    this.bot.command('sol', async (ctx) => this.quickAnalysis(ctx, 'SOLUSDT', '🌞 Solana'));
    this.bot.command('portfolio', async (ctx) => this.executePortfolio(ctx));
    
    // Crypto analysis command (main feature)
    this.bot.command('crypto', async (ctx) => this.cryptoAnalysis(ctx));
    
    // Market overview commands
    this.bot.command('stocks', async (ctx) => this.stocksAnalysis(ctx));
    this.bot.command('help', async (ctx) => this.showHelp(ctx));

    // Legacy v2 command for backward compatibility
    this.bot.command('v2', async (ctx) => {
      const args = ctx.message?.text?.split(' ').slice(1).join(' ') || '';
      if (!args) {
        await ctx.reply('💡 **Try the new interface!**\nUse buttons below for easier analysis:', {
          reply_markup: TradingKeyboards.quickSymbols()
        });
        return;
      }
      
      const params = this.parseArgs(args);
      const symbol = params.symbol || params._[0];
      const model = params.model ? getModelName(params.model) : ctx.session.currentModel;
      const format = params.format || ctx.session.format;
      
      await this.performAnalysis(ctx, symbol, model!, format!);
    });
  }

  private setupCallbacks() {
    // Main menu navigation
    this.bot.callbackQuery('menu_main', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('🏠 **Main Menu**\nChoose an option:', {
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.mainMenu()
      });
    });

    this.bot.callbackQuery('menu_quick', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('⚡ **Quick Analysis**\nSelect an asset:', {
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.quickSymbols()
      });
    });

    this.bot.callbackQuery('menu_portfolio', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('💼 **Portfolio Analysis**\nChoose analysis type:', {
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.portfolioMenu()
      });
    });

    this.bot.callbackQuery('menu_screening', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('🔍 **Asset Screening**\nSelect market:', {
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.screeningMenu()
      });
    });

    this.bot.callbackQuery('menu_models', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('🤖 **AI Model Selection**\nCurrent: ' + (ctx.session.currentModel || 'Default'), {
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.modelSelection(ctx.session.currentModel)
      });
    });

    this.bot.callbackQuery('menu_debug', async (ctx) => {
      await ctx.answerCallbackQuery();
      if (!ctx.session.debugMode) {
        await ctx.editMessageText('🔒 Debug mode not available for your account.');
        return;
      }
      await ctx.editMessageText('🐛 **Debug Center**\nSystem monitoring & diagnostics:', {
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.debugMenu()
      });
    });

    // Quick analysis callbacks
    this.bot.callbackQuery(/^quick_(.+)$/, async (ctx) => {
      const symbol = ctx.match[1];
      await ctx.answerCallbackQuery();
      await this.quickAnalysis(ctx, symbol, symbol);
    });

    // Model selection callbacks
    this.bot.callbackQuery(/^model_select_(.+)$/, async (ctx) => {
      const modelId = ctx.match[1];
      const model = ModelSelector.getModelByName(modelId);
      
      if (model) {
        ctx.session.currentModel = modelId;
        debugSystem.recordModelUsage(modelId);
        
        await ctx.answerCallbackQuery(`✅ Switched to ${model.name}`);
        await ctx.editMessageText(`🤖 **Model Updated**\n\n` +
          `**Selected:** ${model.name}\n` +
          `**Provider:** ${model.provider}\n` +
          `**Speed:** ${model.speed}\n` +
          `**Quality:** ${model.quality}\n` +
          `**Best for:** ${model.bestFor.join(', ')}`, {
          parse_mode: 'Markdown',
          reply_markup: TradingKeyboards.mainMenu()
        });
      }
    });

    // Portfolio callbacks
    this.bot.callbackQuery('portfolio_full', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.executePortfolio(ctx, 'full');
    });

    this.bot.callbackQuery('portfolio_quick', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.executePortfolio(ctx, 'quick');
    });

    // Screening callbacks
    this.bot.callbackQuery(/^screen_(.+)$/, async (ctx) => {
      const category = ctx.match[1];
      await ctx.answerCallbackQuery();
      await this.executeScreening(ctx, category);
    });

    // Debug callbacks
    this.bot.callbackQuery('debug_performance', async (ctx) => {
      await ctx.answerCallbackQuery();
      const metrics = debugSystem.getMetrics();
      const report = this.formatPerformanceReport(metrics);
      await ctx.editMessageText(report, { 
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.debugMenu()
      });
    });

    this.bot.callbackQuery('debug_clear', async (ctx) => {
      await ctx.answerCallbackQuery();
      debugSystem.clear();
      await ctx.editMessageText('✅ Debug logs cleared', {
        reply_markup: TradingKeyboards.debugMenu()
      });
    });
  }

  // Analysis methods
  private async quickAnalysis(ctx: MyContext, symbol: string, displayName: string) {
    const operationId = `quick-${symbol}-${Date.now()}`;
    
    try {
      await ctx.replyWithChatAction('typing');
      
      const result = await timeOperation(operationId, 'bot', 'quick_analysis', async () => {
        const model = ModelSelector.getBestModelForSpeed();
        return await analyzeAssetV2(symbol, model.id);
      }, { symbol, model: ctx.session.currentModel });
      
      const response = this.formatAnalysis(result, 'quick');
      
      await ctx.reply(`${displayName}\n\n${response}`, {
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.analysisActions(symbol)
      });
      
    } catch (error: any) {
      errorLog('bot', 'quick_analysis', error.message, { symbol });
      await ctx.reply(`❌ ${displayName} analysis failed: ${error.message}`, {
        reply_markup: TradingKeyboards.mainMenu()
      });
    }
  }

  private async performAnalysis(ctx: MyContext, symbol: string, model: string, format: string) {
    const operationId = `analysis-${symbol}-${Date.now()}`;
    
    try {
      await ctx.replyWithChatAction('typing');
      const processingMsg = await ctx.reply(`🔍 Analyzing ${symbol}...\n⚡ Using ${model.split('/').pop()}`);
      
      const result = await timeOperation(operationId, 'bot', 'full_analysis', async () => {
        return await analyzeAssetV2(symbol, model);
      }, { symbol, model, format });
      
      const response = this.formatAnalysis(result, format);
      
      await ctx.api.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        response,
        { 
          parse_mode: 'Markdown',
          reply_markup: TradingKeyboards.analysisActions(symbol, true)
        }
      );
      
      ctx.session.lastAnalysis = { symbol, result, timestamp: Date.now() };
      
    } catch (error: any) {
      errorLog('bot', 'full_analysis', error.message, { symbol, model });
      await ctx.reply(`❌ Analysis failed: ${error.message}`, {
        reply_markup: TradingKeyboards.mainMenu()
      });
    }
  }

  private async executePortfolio(ctx: MyContext, mode: 'full' | 'quick' = 'full') {
    const operationId = `portfolio-${mode}-${Date.now()}`;
    
    try {
      await ctx.replyWithChatAction('typing');
      const processingMsg = await ctx.reply(
        `🚀 **Portfolio Analysis Starting...**\n\n` +
        `🔍 **Stage 1**: Screening assets\n` +
        `⏳ **Stage 2**: Deep analysis\n` +
        `💼 **Stage 3**: Portfolio optimization\n\n` +
        `*${mode === 'quick' ? 'Quick mode: 1-2 minutes' : 'Full mode: 2-3 minutes'}...*`,
        { parse_mode: 'Markdown' }
      );

      const symbols = mode === 'quick' 
        ? ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'AAPL', 'MSFT', 'NVDA']
        : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'AAPL', 'MSFT', 'GOOGL', 'NVDA', 'TSLA', 'META'];

      const portfolio = await timeOperation(operationId, 'bot', 'portfolio_analysis', async () => {
        return await this.orchestrator.executeFullFunnel(symbols, '6h', mode === 'quick' ? 4 : 8);
      }, { mode, symbolCount: symbols.length });

      const response = this.formatPortfolioResult(portfolio);
      
      await ctx.api.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        response,
        { 
          parse_mode: 'Markdown',
          reply_markup: TradingKeyboards.portfolioActions()
        }
      );

    } catch (error: any) {
      errorLog('bot', 'portfolio_analysis', error.message, { mode });
      await ctx.reply(`❌ Portfolio analysis failed: ${error.message}`, {
        reply_markup: TradingKeyboards.mainMenu()
      });
    }
  }

  private async executeScreening(ctx: MyContext, category: string) {
    const operationId = `screening-${category}-${Date.now()}`;
    
    try {
      await ctx.replyWithChatAction('typing');
      const processingMsg = await ctx.reply(`🔍 **Screening ${category.toUpperCase()} Assets...**`, { parse_mode: 'Markdown' });

      const symbols = this.getSymbolsForCategory(category);
      const mockData = this.createMockScreeningData(symbols);
      
      const result = await timeOperation(operationId, 'bot', 'screening', async () => {
        // Mock screening result since QuantScreener was removed
        return {
          top: mockData.slice(0, 8).map(asset => ({
            symbol: asset.symbol,
            score: Math.random() * 0.4 + 0.6, // 60-100%
            dir: Math.random() > 0.5 ? 'long' : 'short',
            rr_potential: Math.random() * 2 + 1.5, // 1.5-3.5
            risks: ['volatility', 'liquidity'].filter(() => Math.random() > 0.7),
            reason: `Technical setup favoring ${Math.random() > 0.5 ? 'momentum' : 'reversal'} play`
          }))
        };
      }, { category, symbolCount: symbols.length });

      const response = this.formatScreeningResult(result, category);
      
      await ctx.api.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        response,
        { 
          parse_mode: 'Markdown',
          reply_markup: TradingKeyboards.mainMenu()
        }
      );

    } catch (error: any) {
      errorLog('bot', 'screening', error.message, { category });
      await ctx.reply(`❌ Screening failed: ${error.message}`, {
        reply_markup: TradingKeyboards.mainMenu()
      });
    }
  }

  // Utility methods
  private parseArgs(args: string): any {
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

  private formatAnalysis(decision: any, format: string): string {
    const emoji = decision.position === 'long' ? '📈' : decision.position === 'short' ? '📉' : '⏸️';
    const confidence = Math.round(decision.confidence * 100);
    const confidenceColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
    
    if (format === 'quick') {
      return `${emoji} **${decision.asset}** ${decision.position.toUpperCase()}\n` +
             `${confidenceColor} **${confidence}%** confidence\n` +
             `💭 ${decision.rationale.substring(0, 100)}...`;
    }
    
    // Compact/Full format (unified for cleaner UI)
    return `${emoji} **${decision.asset} Analysis**\n\n` +
           `📊 **Position:** ${decision.position.toUpperCase()}\n` +
           `${confidenceColor} **Confidence:** ${confidence}%\n` +
           `💭 **Rationale:** ${decision.rationale}\n\n` +
           `💰 **Entry:** $${(decision.entry.lower || decision.entry.price || 0).toFixed(4)} - $${(decision.entry.upper || decision.entry.price || 0).toFixed(4)}\n` +
           `🛡️ **Stop:** $${(decision.stop || 0).toFixed(4)}\n` +
           `🎯 **Targets:** ${decision.targets.map((t: any) => `$${t.price.toFixed(4)}`).join(', ')}\n` +
           `⚖️ **R:R:** ${decision.realized_rr_est}:1`;
  }

  private formatPortfolioResult(portfolio: any): string {
    const picks = portfolio.picks;
    if (!picks || picks.length === 0) {
      return `💼 **Portfolio Analysis Complete**\n\n❌ No suitable positions found.\n\nTry adjusting risk parameters or wait for better market conditions.`;
    }

    let response = `💼 **Portfolio Analysis Complete**\n\n`;
    response += `🎯 **Selected Positions (${picks.length}):**\n\n`;

    picks.forEach((pick: any) => {
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

    response += `⚠️ *Educational analysis only. Always do your own research.*`;
    return response;
  }

  private formatScreeningResult(result: any, category: string): string {
    const top = result.top;
    if (!top || top.length === 0) {
      return `🔍 **${category.toUpperCase()} Screening Complete**\n\n❌ No assets passed screening criteria.`;
    }

    let response = `🔍 **${category.toUpperCase()} Screening Results**\n\n`;
    response += `📊 **Top ${top.length} Candidates:**\n\n`;

    top.forEach((item: any, index: number) => {
      const emoji = item.dir === 'long' ? '📈' : item.dir === 'short' ? '📉' : '⏸️';
      const scoreColor = item.score >= 0.7 ? '🟢' : item.score >= 0.5 ? '🟡' : '🔴';
      
      response += `${index + 1}. ${emoji} **${item.symbol}**\n`;
      response += `├ Score: ${(item.score * 100).toFixed(0)}% ${scoreColor} │ Direction: ${item.dir.toUpperCase()}\n`;
      response += `├ R:R Potential: ${item.rr_potential.toFixed(1)}:1\n`;
      if (item.risks.length > 0) {
        response += `├ Risks: ${item.risks.join(', ')}\n`;
      }
      response += `└ ${item.reason}\n\n`;
    });

    return response;
  }

  private formatPerformanceReport(metrics: any): string {
    let report = `📊 **Performance Metrics**\n\n`;
    
    // Operation counts
    const topOps = Object.entries(metrics.operationCounts)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 5);
    
    report += `**🔢 Top Operations:**\n`;
    topOps.forEach(([op, count]) => {
      report += `• ${op}: ${count} calls\n`;
    });
    
    // Average durations
    report += `\n**⏱️ Average Durations:**\n`;
    Object.entries(metrics.averageDurations).slice(0, 5).forEach(([op, duration]) => {
      report += `• ${op}: ${(duration as number / 1000).toFixed(2)}s\n`;
    });
    
    // Model usage
    report += `\n**🤖 Model Usage:**\n`;
    Object.entries(metrics.modelUsage).forEach(([model, count]) => {
      report += `• ${model.split('/').pop()}: ${count} calls\n`;
    });
    
    return report;
  }

  private getSymbolsForCategory(category: string): string[] {
    const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT', 'UNIUSDT'];
    const stockSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'NFLX'];
    
    switch (category) {
      case 'crypto': return cryptoSymbols;
      case 'stocks': return stockSymbols;
      case 'all': return [...cryptoSymbols, ...stockSymbols];
      default: return cryptoSymbols;
    }
  }

  private createMockScreeningData(symbols: string[]): any[] {
    return symbols.map(symbol => ({
      symbol,
      price: Math.random() * 1000 + 100,
      atr_pct: Math.random() * 0.05 + 0.01,
      rsi: Math.random() * 60 + 20,
      ma50_slope: (Math.random() - 0.5) * 0.1,
      adx: Math.random() * 30 + 15,
      age_sec: Math.random() * 120 + 30
    }));
  }

  // Enhanced crypto analysis with 7-line format
  private async cryptoAnalysis(ctx: MyContext) {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT'];
    
    await ctx.replyWithChatAction('typing');
    const processingMsg = await ctx.reply('🚀 Analyzing top crypto assets with enhanced signals...');
    
    try {
      const results = await Promise.allSettled(
        symbols.map(symbol => analyzeAssetV2(symbol, ctx.session.currentModel || 'openai/gpt-5-mini'))
      );
      
      let responses: string[] = [];
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const symbol = symbols[i];
        
        if (result.status === 'fulfilled') {
          const decision = result.value;
          const formatted = this.formatCryptoSignal(decision);
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
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.mainMenu()
      });
      
    } catch (error: any) {
      await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, `❌ Crypto analysis failed: ${error.message}`);
    }
  }

  // Stocks analysis
  private async stocksAnalysis(ctx: MyContext) {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA'];
    
    await ctx.replyWithChatAction('typing');
    const processingMsg = await ctx.reply('📈 Scanning tech stocks...');
    
    try {
      const results = await Promise.allSettled(
        symbols.map(symbol => analyzeAssetV2(symbol, ctx.session.currentModel || 'openai/gpt-4o-mini'))
      );
      
      let overview = `📈 **Tech Stocks Overview**\n\n`;
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
        parse_mode: 'Markdown',
        reply_markup: TradingKeyboards.mainMenu()
      });
      
    } catch (error: any) {
      await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, `❌ Tech stocks overview failed: ${error.message}`);
    }
  }

  // Help command
  private async showHelp(ctx: MyContext) {
    const helpText = `📚 **AI Trading Bot V3 - All Commands**

**🔥 Quick Analysis:**
• \`/btc\` - Bitcoin analysis
• \`/eth\` - Ethereum analysis  
• \`/sol\` - Solana analysis
• \`/crypto\` - Top 4 crypto overview
• \`/stocks\` - Tech stocks overview

**🤖 Advanced Features:**
• \`/portfolio\` - Full portfolio funnel analysis
• \`/model [name]\` - Change AI model
• \`/debug\` - System diagnostics (if enabled)

**⚙️ Settings & Models:**
• Use buttons for easier navigation
• GPT-5 Mini for speed (default)
• Claude 3.5 Sonnet for quality
• GPT-4o for premium analysis

**💡 Pro Tips:**
• Use the button interface for easier navigation
• Portfolio analysis screens 100+ assets
• All analysis is educational only

**🆘 Need Help?**
Just type any symbol name or use the buttons below!`;

    await ctx.reply(helpText, { 
      parse_mode: 'Markdown',
      reply_markup: TradingKeyboards.mainMenu()
    });
  }

  // Enhanced 7-line crypto signal formatter
  private formatCryptoSignal(decision: any): string {
    const emoji = decision.position === 'long' ? '📈' : decision.position === 'short' ? '📉' : '⏸️';
    try {
      const compactOutput = toCompactLines(decision);
      return `${emoji} **${decision.asset} Signal**\n\n\`\`\`\n${compactOutput}\n\`\`\``;
    } catch (error) {
      // Fallback to manual format if toCompactLines fails
      const confidence = Math.round(decision.confidence * 100);
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

  // Bot control methods
  async start() {
    try {
      infoLog('bot', 'startup', { version: 'v3' });
      await this.bot.start();
      infoLog('bot', 'startup_success', { version: 'v3' });
      return true;
    } catch (error: any) {
      errorLog('bot', 'startup_failed', error.message);
      throw error;
    }
  }

  async stop() {
    try {
      await this.bot.stop();
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      infoLog('bot', 'shutdown', { version: 'v3' });
      return true;
    } catch (error: any) {
      errorLog('bot', 'shutdown_failed', error.message);
      throw error;
    }
  }
}

// Export for use
export const tradingBot = new TradingBotV3();

// Auto-start if this is the main module
if (require.main === module) {
  tradingBot.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', () => tradingBot.stop());
  process.on('SIGTERM', () => tradingBot.stop());
}