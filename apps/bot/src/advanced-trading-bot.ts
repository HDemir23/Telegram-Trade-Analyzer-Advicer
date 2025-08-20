// 🚀 Advanced AI Trading Bot - Complete Market Analysis System
// Features: AI Analysis, Profitable Positions, Modern UI, Real-time Data

import { Bot, session, Context, SessionFlavor, InlineKeyboard } from 'grammy';
import { RedisAdapter } from '@grammyjs/storage-redis';
import { createClient } from 'redis';
import { botConfig } from './config';

// Import AI systems
import { 
  analyzeAssetV2, 
  marketDataCache,
  toCompactLines,
  MultiFunnelOrchestrator,
  AI_MODELS,
  ModelSelector
} from '@trade/ai';

// Session interface
interface SessionData {
  userId?: number;
  chatId?: number;
  currentModel?: string;
  format?: 'compact' | 'detailed' | 'signals';
  watchlist?: string[];
  riskLevel?: 'conservative' | 'moderate' | 'aggressive';
  autoNotify?: boolean;
  lastAnalysis?: any;
}

type MyContext = Context & SessionFlavor<SessionData>;

// Environment configuration (centralized)
const env = botConfig;

export class AdvancedTradingBot {
  private bot: Bot<MyContext>;
  private redisClient: ReturnType<typeof createClient> | null = null;
  private orchestrator = new MultiFunnelOrchestrator();

  constructor() {
    if (!env.TELEGRAM_BOT_TOKEN) {
      throw new Error('❌ TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new Bot<MyContext>(env.TELEGRAM_BOT_TOKEN);
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
  }

  private async setupMiddleware() {
    // Session setup
    if (env.REDIS_URL?.trim()) {
      try {
        this.redisClient = createClient({ url: env.REDIS_URL });
        await this.redisClient.connect();
        this.bot.use(session({
          initial: () => ({}),
          storage: new RedisAdapter({ instance: this.redisClient! })
        }));
        console.log('✅ Redis session storage configured');
      } catch (error) {
        console.warn('⚠️ Redis failed, using in-memory storage');
        this.bot.use(session({ initial: () => ({}) }));
      }
    } else {
      this.bot.use(session({ initial: () => ({}) }));
      console.log('✅ In-memory session storage configured');
    }

    // Session initialization
    this.bot.use(async (ctx, next) => {
      if (!ctx.session) {
        ctx.session = this.getDefaultSession(ctx);
      }
      await next();
    });

    // Error handling
    this.bot.catch((err) => {
      console.error('❌ Bot error:', err.error);
      err.ctx.reply('❌ Something went wrong. Please try again.').catch(() => {});
    });
  }

  private getDefaultSession(ctx: MyContext): SessionData {
    return {
      userId: ctx.from?.id,
      chatId: ctx.chat?.id,
      currentModel: 'openai/gpt-5-mini',
      format: 'compact',
      watchlist: [],
      riskLevel: 'moderate',
      autoNotify: false
    };
  }

  private setupCommands() {
    // 🏠 Main menu command
    this.bot.command('start', async (ctx) => {
      const firstName = ctx.from?.first_name || 'Trader';
      const welcomeMessage = `🚀 **Welcome to Advanced AI Trading Bot, ${firstName}!**

🤖 **Powered by Latest AI Models:**
• GPT-5 Mini for ultra-fast analysis
• Real-time market data processing
• Advanced profitable position detection

📊 **Features:**
• 🎯 Smart market analysis
• 💰 Profitable position finder
• 📈 Multi-asset portfolio optimization
• 🔔 Real-time alerts

**Choose your analysis type below:**`;

      await ctx.reply(welcomeMessage, {
        parse_mode: 'Markdown',
        reply_markup: this.createMainMenu()
      });
    });

    // 🔥 Market Analysis Commands
    this.bot.command('crypto', async (ctx) => this.analyzeCryptoMarkets(ctx));
    this.bot.command('stocks', async (ctx) => this.analyzeStockMarkets(ctx));
    this.bot.command('profitable', async (ctx) => this.findProfitablePositions(ctx));
    this.bot.command('portfolio', async (ctx) => this.buildOptimalPortfolio(ctx));
    
    // Quick individual analysis
    this.bot.command('btc', async (ctx) => this.quickAnalysis(ctx, 'BTCUSDT', '🟠 Bitcoin'));
    this.bot.command('eth', async (ctx) => this.quickAnalysis(ctx, 'ETHUSDT', '💎 Ethereum'));
    this.bot.command('tsla', async (ctx) => this.quickAnalysis(ctx, 'TSLA', '🚗 Tesla'));
    this.bot.command('aapl', async (ctx) => this.quickAnalysis(ctx, 'AAPL', '🍎 Apple'));

    // Settings and help
    this.bot.command('settings', async (ctx) => this.showSettings(ctx));
    this.bot.command('help', async (ctx) => this.showHelp(ctx));
  }

  private setupCallbacks() {
    // Main menu navigation
    this.bot.callbackQuery('menu_crypto', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.analyzeCryptoMarkets(ctx, true);
    });

    this.bot.callbackQuery('menu_stocks', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.analyzeStockMarkets(ctx, true);
    });

    this.bot.callbackQuery('menu_profitable', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.findProfitablePositions(ctx, true);
    });

    this.bot.callbackQuery('menu_portfolio', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.buildOptimalPortfolio(ctx, true);
    });

    this.bot.callbackQuery('menu_settings', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.showSettings(ctx, true);
    });

    this.bot.callbackQuery('back_main', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('🏠 **Main Menu**\n\nChoose your analysis type:', {
        parse_mode: 'Markdown',
        reply_markup: this.createMainMenu()
      });
    });

    // Settings callbacks
    this.bot.callbackQuery(/^model_(.+)$/, async (ctx) => {
      const modelId = ctx.match[1];
      ctx.session.currentModel = modelId;
      await ctx.answerCallbackQuery(`✅ Switched to ${modelId.split('/').pop()}`);
      await this.showSettings(ctx, true);
    });

    this.bot.callbackQuery(/^format_(.+)$/, async (ctx) => {
      const format = ctx.match[1] as 'compact' | 'detailed' | 'signals';
      ctx.session.format = format;
      await ctx.answerCallbackQuery(`✅ Format changed to ${format}`);
      await this.showSettings(ctx, true);
    });

    this.bot.callbackQuery(/^risk_(.+)$/, async (ctx) => {
      const riskLevel = ctx.match[1] as 'conservative' | 'moderate' | 'aggressive';
      ctx.session.riskLevel = riskLevel;
      await ctx.answerCallbackQuery(`✅ Risk level set to ${riskLevel}`);
      await this.showSettings(ctx, true);
    });

    // Quick analysis callbacks
    this.bot.callbackQuery(/^analyze_(.+)$/, async (ctx) => {
      const symbol = ctx.match[1];
      await ctx.answerCallbackQuery();
      await this.quickAnalysis(ctx, symbol, symbol);
    });

    // Refresh analysis
    this.bot.callbackQuery(/^refresh_(.+)$/, async (ctx) => {
      const symbol = ctx.match[1];
      await ctx.answerCallbackQuery();
      await this.quickAnalysis(ctx, symbol, `🔄 ${symbol} (Refreshed)`);
    });
  }

  // 📊 Main Analysis Methods

  private async analyzeCryptoMarkets(ctx: MyContext, isEdit: boolean = false) {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT'];
    
    await ctx.replyWithChatAction('typing');
    const processingMsg = isEdit ? null : await ctx.reply('🚀 **Analyzing Crypto Markets...**\\n\\n🔍 Processing 6 major cryptocurrencies\\n⏳ Using advanced AI analysis', { parse_mode: 'Markdown' });

    try {
      const results = await Promise.allSettled(
        symbols.map(symbol => analyzeAssetV2(symbol, ctx.session.currentModel!))
      );

      let analysis = '📊 **Crypto Market Analysis**\\n\\n';
      let profitable: any[] = [];
      let signals: string[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const symbol = symbols[i];
        
        if (result.status === 'fulfilled') {
          const decision = result.value;
          const confidence = Math.round(decision.confidence * 100);
          const emoji = this.getPositionEmoji(decision.position);
          const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
          
          analysis += `${emoji} **${symbol.replace('USDT', '')}**: ${decision.position.toUpperCase()} (${confidence}%) ${riskColor}\\n`;
          
          if (decision.position !== 'hold' && confidence >= 60) {
            profitable.push({ symbol, decision, confidence });
            
            if (ctx.session.format === 'signals') {
              try {
                signals.push(toCompactLines(decision));
              } catch (e) {
                signals.push(`${symbol}: ${decision.position} @ ${confidence}%`);
              }
            }
          }
        } else {
          analysis += `❌ **${symbol}**: Analysis failed\\n`;
        }
      }

      analysis += `\\n💰 **Profitable Opportunities: ${profitable.length}**\\n`;
      analysis += `🎯 **High Confidence Signals: ${profitable.filter(p => p.confidence >= 75).length}**\\n\\n`;

      if (ctx.session.format === 'signals' && signals.length > 0) {
        analysis += '**🔥 Trading Signals:**\\n\\n';
        signals.slice(0, 3).forEach(signal => {
          analysis += `\`\`\`\\n${signal}\\n\`\`\`\\n`;
        });
      }

      analysis += '**💡 Next Steps:**\\n';
      analysis += '• Use /profitable for detailed position analysis\\n';
      analysis += '• Use /portfolio for optimized allocation\\n';
      analysis += '• Individual analysis: /btc /eth /sol';

      const keyboard = new InlineKeyboard()
        .text('💰 Find Profitable Positions', 'menu_profitable')
        .text('📊 Build Portfolio', 'menu_portfolio').row()
        .text('🔄 Refresh Analysis', 'menu_crypto')
        .text('🏠 Main Menu', 'back_main');

      if (isEdit) {
        await ctx.editMessageText(analysis, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else if (processingMsg) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          analysis,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      }

    } catch (error: any) {
      const errorMsg = `❌ **Crypto Analysis Failed**\\n\\n${error.message}`;
      if (isEdit) {
        await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' });
      } else if (processingMsg) {
        await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, errorMsg, { parse_mode: 'Markdown' });
      }
    }
  }

  private async analyzeStockMarkets(ctx: MyContext, isEdit: boolean = false) {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META'];
    
    await ctx.replyWithChatAction('typing');
    const processingMsg = isEdit ? null : await ctx.reply('📈 **Analyzing Stock Markets...**\\n\\n🔍 Processing 6 major tech stocks\\n⏳ Using advanced AI analysis', { parse_mode: 'Markdown' });

    try {
      const results = await Promise.allSettled(
        symbols.map(symbol => analyzeAssetV2(symbol, ctx.session.currentModel!))
      );

      let analysis = '📈 **Stock Market Analysis**\\n\\n';
      let bullish = 0, bearish = 0, neutral = 0;
      let profitable: any[] = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const symbol = symbols[i];
        
        if (result.status === 'fulfilled') {
          const decision = result.value;
          const confidence = Math.round(decision.confidence * 100);
          const emoji = this.getPositionEmoji(decision.position);
          const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
          
          analysis += `${emoji} **${symbol}**: ${decision.position.toUpperCase()} (${confidence}%) ${riskColor}\\n`;
          
          if (decision.position === 'long') bullish++;
          else if (decision.position === 'short') bearish++;
          else neutral++;

          if (decision.position !== 'hold' && confidence >= 60) {
            profitable.push({ symbol, decision, confidence });
          }
        } else {
          analysis += `❌ **${symbol}**: Analysis failed\\n`;
        }
      }

      analysis += `\\n📊 **Market Sentiment:**\\n`;
      analysis += `📈 Bullish: ${bullish} | 📉 Bearish: ${bearish} | ⏸️ Neutral: ${neutral}\\n\\n`;
      analysis += `💰 **Profitable Opportunities: ${profitable.length}**\\n`;
      analysis += `🎯 **High Confidence: ${profitable.filter(p => p.confidence >= 75).length}**\\n\\n`;

      const topStock = profitable.sort((a, b) => b.confidence - a.confidence)[0];
      if (topStock) {
        analysis += `🏆 **Top Pick: ${topStock.symbol}** (${topStock.confidence}% confidence)\\n`;
        analysis += `Position: ${topStock.decision.position.toUpperCase()} | R:R: ${topStock.decision.realized_rr_est}:1`;
      }

      const keyboard = new InlineKeyboard()
        .text('💰 Profitable Positions', 'menu_profitable')
        .text('📊 Build Portfolio', 'menu_portfolio').row()
        .text('🔄 Refresh Analysis', 'menu_stocks')
        .text('🏠 Main Menu', 'back_main');

      if (isEdit) {
        await ctx.editMessageText(analysis, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else if (processingMsg) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          analysis,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      }

    } catch (error: any) {
      const errorMsg = `❌ **Stock Analysis Failed**\\n\\n${error.message}`;
      if (isEdit) {
        await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' });
      } else if (processingMsg) {
        await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, errorMsg, { parse_mode: 'Markdown' });
      }
    }
  }

  private async findProfitablePositions(ctx: MyContext, isEdit: boolean = false) {
    const allSymbols = [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT',
      'AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META'
    ];
    
    await ctx.replyWithChatAction('typing');
    const processingMsg = isEdit ? null : await ctx.reply('💰 **Finding Most Profitable Positions...**\\n\\n🎯 Analyzing 12 top assets\\n🔍 Filtering for high-probability trades\\n⏳ Using advanced AI scoring', { parse_mode: 'Markdown' });

    try {
      const results = await Promise.allSettled(
        allSymbols.map(symbol => analyzeAssetV2(symbol, ctx.session.currentModel!))
      );

      let profitable: any[] = [];
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const symbol = allSymbols[i];
        
        if (result.status === 'fulfilled') {
          const decision = result.value;
          const confidence = decision.confidence * 100;
          const rr = decision.realized_rr_est || 1;
          
          // Score based on confidence, risk-reward, and position strength
          const score = (confidence * 0.4) + (rr * 20) + (decision.position !== 'hold' ? 30 : 0);
          
          if (decision.position !== 'hold' && confidence >= 50 && score >= 60) {
            profitable.push({
              symbol,
              decision,
              confidence: Math.round(confidence),
              rr,
              score: Math.round(score),
              market: symbol.includes('USDT') ? '🪙 Crypto' : '📈 Stock'
            });
          }
        }
      }

      // Sort by score (best opportunities first)
      profitable.sort((a, b) => b.score - a.score);

      let analysis = '💰 **Most Profitable Trading Positions**\\n\\n';
      
      if (profitable.length === 0) {
        analysis += '❌ No high-probability positions found right now.\\n\\n';
        analysis += '💡 **Suggestions:**\\n';
        analysis += '• Market may be in consolidation\\n';
        analysis += '• Try lowering risk threshold in settings\\n';
        analysis += '• Check again in a few hours';
      } else {
        analysis += `🎯 **Found ${profitable.length} Profitable Opportunities**\\n\\n`;
        
        profitable.slice(0, 5).forEach((pos, index) => {
          const emoji = this.getPositionEmoji(pos.decision.position);
          const riskColor = pos.confidence >= 75 ? '🟢' : pos.confidence >= 60 ? '🟡' : '🔴';
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
          
          analysis += `${medal} ${emoji} **${pos.symbol.replace('USDT', '')}** ${pos.market}\\n`;
          analysis += `├ Position: ${pos.decision.position.toUpperCase()}\\n`;
          analysis += `├ Confidence: ${pos.confidence}% ${riskColor}\\n`;
          analysis += `├ Risk:Reward: ${pos.rr.toFixed(1)}:1\\n`;
          analysis += `├ Score: ${pos.score}/100\\n`;
          analysis += `└ Entry: $${(pos.decision.entry.lower || pos.decision.entry.price || 0).toFixed(4)}\\n\\n`;
        });

        // Risk level recommendations
        const riskLevel = ctx.session.riskLevel;
        analysis += `⚖️ **Risk Level: ${riskLevel?.toUpperCase()}**\\n`;
        if (riskLevel === 'conservative') {
          analysis += '• Focus on positions with 75%+ confidence\\n';
          analysis += '• Suggested position size: 2-5% per trade';
        } else if (riskLevel === 'moderate') {
          analysis += '• Consider positions with 60%+ confidence\\n';
          analysis += '• Suggested position size: 5-10% per trade';
        } else {
          analysis += '• All positions shown are suitable\\n';
          analysis += '• Suggested position size: 10-15% per trade';
        }
      }

      const keyboard = new InlineKeyboard()
        .text('📊 Build Portfolio', 'menu_portfolio')
        .text('🪙 Crypto Markets', 'menu_crypto').row()
        .text('📈 Stock Markets', 'menu_stocks')
        .text('🔄 Refresh', 'menu_profitable').row()
        .text('🏠 Main Menu', 'back_main');

      if (isEdit) {
        await ctx.editMessageText(analysis, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else if (processingMsg) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          analysis,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      }

    } catch (error: any) {
      const errorMsg = `❌ **Profitable Position Analysis Failed**\\n\\n${error.message}`;
      if (isEdit) {
        await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' });
      } else if (processingMsg) {
        await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, errorMsg, { parse_mode: 'Markdown' });
      }
    }
  }

  private async buildOptimalPortfolio(ctx: MyContext, isEdit: boolean = false) {
    await ctx.replyWithChatAction('typing');
    const processingMsg = isEdit ? null : await ctx.reply('📊 **Building Optimal Portfolio...**\\n\\n🔍 Multi-stage analysis pipeline\\n⚖️ Optimizing risk-adjusted returns\\n🎯 Selecting best positions\\n⏳ This may take 1-2 minutes', { parse_mode: 'Markdown' });

    try {
      const symbols = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT',
        'AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META', 'AMZN', 'NFLX'
      ];

      const portfolio = await this.orchestrator.executeFullFunnel(symbols, '6h', 5);
      
      let analysis = '📊 **Optimal Portfolio Constructed**\\n\\n';
      
      if (!portfolio.picks || portfolio.picks.length === 0) {
        analysis += '❌ No suitable portfolio positions found.\\n\\n';
        analysis += '**Possible reasons:**\\n';
        analysis += '• Market volatility too high\\n';
        analysis += '• Risk criteria too strict\\n';
        analysis += '• Waiting for better entry points\\n\\n';
        analysis += '💡 Try adjusting risk settings or check back later.';
      } else {
        analysis += `🎯 **Selected Positions: ${portfolio.picks.length}**\\n\\n`;
        
        let totalAllocation = 0;
        portfolio.picks.forEach((pick: any, index: number) => {
          const emoji = this.getPositionEmoji(pick.position);
          const confidenceColor = pick.confidence >= 0.75 ? '🟢' : pick.confidence >= 0.6 ? '🟡' : '🔴';
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
          
          analysis += `${medal} ${emoji} **${pick.asset.replace('USDT', '')}**\\n`;
          analysis += `├ Position: ${pick.position.toUpperCase()}\\n`;
          analysis += `├ Allocation: ${pick.size_pct}%\\n`;
          analysis += `├ Confidence: ${Math.round(pick.confidence * 100)}% ${confidenceColor}\\n`;
          analysis += `├ Expected R:R: ${pick.expected_rr.toFixed(1)}:1\\n`;
          analysis += `└ ${pick.notes || 'Strong technical setup'}\\n\\n`;
          
          totalAllocation += pick.size_pct;
        });

        analysis += `📈 **Portfolio Statistics:**\\n`;
        analysis += `├ Total Allocation: ${totalAllocation}%\\n`;
        analysis += `├ Cash Reserve: ${100 - totalAllocation}%\\n`;
        analysis += `├ Risk Diversification: ${portfolio.diversification?.sector_spread?.length || 'Multiple'} sectors\\n`;
        analysis += `└ Max Position Correlation: ${((portfolio.diversification?.pairwise_max_corr || 0.5) * 100).toFixed(0)}%\\n\\n`;

        analysis += `⚠️ **Risk Management:**\\n`;
        analysis += `• Portfolio optimized for ${ctx.session.riskLevel} risk level\\n`;
        analysis += `• Positions sized based on confidence and volatility\\n`;
        analysis += `• Correlation-adjusted to reduce portfolio risk\\n`;
        analysis += `• Stop-losses included for capital protection`;
      }

      const keyboard = new InlineKeyboard()
        .text('💰 Profitable Positions', 'menu_profitable')
        .text('🔄 Rebuild Portfolio', 'menu_portfolio').row()
        .text('⚙️ Adjust Settings', 'menu_settings')
        .text('🏠 Main Menu', 'back_main');

      if (isEdit) {
        await ctx.editMessageText(analysis, {
          parse_mode: 'Markdown',
          reply_markup: keyboard
        });
      } else if (processingMsg) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          analysis,
          { parse_mode: 'Markdown', reply_markup: keyboard }
        );
      }

    } catch (error: any) {
      const errorMsg = `❌ **Portfolio Construction Failed**\\n\\n${error.message}\\n\\nTry using individual market analysis instead.`;
      if (isEdit) {
        await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' });
      } else if (processingMsg) {
        await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, errorMsg, { parse_mode: 'Markdown' });
      }
    }
  }

  private async quickAnalysis(ctx: MyContext, symbol: string, displayName: string) {
    try {
      await ctx.replyWithChatAction('typing');
      const processingMsg = await ctx.reply(`🔍 **Analyzing ${displayName}...**`, { parse_mode: 'Markdown' });
      
      const decision = await analyzeAssetV2(symbol, ctx.session.currentModel!);
      const confidence = Math.round(decision.confidence * 100);
      const emoji = this.getPositionEmoji(decision.position);
      const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
      
      let response = `${emoji} **${displayName} Analysis**\\n\\n`;
      response += `📊 **Position:** ${decision.position.toUpperCase()}\\n`;
      response += `${riskColor} **Confidence:** ${confidence}%\\n`;
      response += `💭 **Rationale:** ${decision.rationale}\\n\\n`;
      
      if (decision.position !== 'hold') {
        response += `💰 **Trading Details:**\\n`;
        response += `├ Entry: $${(decision.entry.lower || decision.entry.price || 0).toFixed(4)} - $${(decision.entry.upper || decision.entry.price || 0).toFixed(4)}\\n`;
        response += `├ Stop Loss: $${(decision.stop || 0).toFixed(4)}\\n`;
        response += `├ Target: $${decision.targets?.[0]?.price?.toFixed(4) || 'N/A'}\\n`;
        response += `└ Risk:Reward: ${decision.realized_rr_est}:1\\n\\n`;
        
        if (ctx.session.format === 'signals') {
          try {
            const signal = toCompactLines(decision);
            response += `**🔥 Trading Signal:**\\n\`\`\`\\n${signal}\\n\`\`\``;
          } catch (e) {
            // Skip signal format if fails
          }
        }
      }

      const keyboard = new InlineKeyboard()
        .text('🔄 Refresh', `refresh_${symbol}`)
        .text('💰 Find More', 'menu_profitable').row()
        .text('🏠 Main Menu', 'back_main');

      await ctx.api.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        response,
        { 
          parse_mode: 'Markdown',
          reply_markup: keyboard 
        }
      );
      
    } catch (error: any) {
      await ctx.reply(`❌ ${displayName} analysis failed: ${error.message}`, {
        reply_markup: new InlineKeyboard().text('🏠 Main Menu', 'back_main')
      });
    }
  }

  private async showSettings(ctx: MyContext, isEdit: boolean = false) {
    const currentModel = ctx.session.currentModel?.split('/').pop() || 'gpt-5-mini';
    const format = ctx.session.format || 'compact';
    const riskLevel = ctx.session.riskLevel || 'moderate';
    
    let settings = `⚙️ **Bot Settings**\\n\\n`;
    settings += `🤖 **AI Model:** ${currentModel}\\n`;
    settings += `📊 **Format:** ${format}\\n`;
    settings += `⚖️ **Risk Level:** ${riskLevel}\\n\\n`;
    settings += `**Adjust your preferences:**`;

    const keyboard = new InlineKeyboard()
      .text('🤖 GPT-5 Mini', 'model_openai/gpt-5-mini')
      .text('🧠 GPT-4o', 'model_openai/gpt-4o').row()
      .text('📊 Compact', 'format_compact')
      .text('📈 Detailed', 'format_detailed')
      .text('🔥 Signals', 'format_signals').row()
      .text('🛡️ Conservative', 'risk_conservative')
      .text('⚖️ Moderate', 'risk_moderate')
      .text('🚀 Aggressive', 'risk_aggressive').row()
      .text('🏠 Main Menu', 'back_main');

    if (isEdit) {
      await ctx.editMessageText(settings, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    } else {
      await ctx.reply(settings, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }
  }

  private async showHelp(ctx: MyContext) {
    const help = `📚 **Advanced AI Trading Bot - Help**

**🔥 Main Features:**
• \`/crypto\` - Comprehensive crypto market analysis
• \`/stocks\` - Tech stock market overview
• \`/profitable\` - Find most profitable positions
• \`/portfolio\` - Build optimal portfolio

**⚡ Quick Analysis:**
• \`/btc\` - Bitcoin analysis
• \`/eth\` - Ethereum analysis  
• \`/tsla\` - Tesla stock analysis
• \`/aapl\` - Apple stock analysis

**⚙️ Settings & Tools:**
• \`/settings\` - Adjust AI model and risk preferences
• \`/help\` - Show this help message
• \`/start\` - Return to main menu

**🤖 AI Models:**
• **GPT-5 Mini** - Ultra-fast analysis (recommended)
• **GPT-4o** - Premium detailed analysis

**📊 Analysis Formats:**
• **Compact** - Key insights and recommendations
• **Detailed** - Full technical analysis
• **Signals** - Trading signals in compact format

**⚖️ Risk Levels:**
• **Conservative** - High-confidence trades only (75%+)
• **Moderate** - Balanced approach (60%+)
• **Aggressive** - All viable opportunities (50%+)

**💡 Pro Tips:**
• Use button interface for easier navigation
• Portfolio analysis screens 14+ assets simultaneously
• All analysis is educational - always do your own research
• Risk management tools built-in for capital protection

**Need help? Just press any button or type a command!**`;

    await ctx.reply(help, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('🏠 Main Menu', 'back_main')
    });
  }

  // Utility Methods
  private createMainMenu(): InlineKeyboard {
    return new InlineKeyboard()
      .text('🪙 Crypto Markets', 'menu_crypto')
      .text('📈 Stock Markets', 'menu_stocks').row()
      .text('💰 Profitable Positions', 'menu_profitable').row()
      .text('📊 Optimal Portfolio', 'menu_portfolio').row()
      .text('⚙️ Settings', 'menu_settings');
  }

  private getPositionEmoji(position: string): string {
    switch (position) {
      case 'long': return '📈';
      case 'short': return '📉';
      case 'hold': return '⏸️';
      default: return '❓';
    }
  }

  // Bot Control Methods
  async start() {
    try {
      console.log('🚀 Starting Advanced AI Trading Bot...');
      
      // Initialize market data cache
      console.log('📦 Initializing market data cache...');
      await marketDataCache.init();
      await marketDataCache.preloadAllSymbols();
      console.log('✅ Market data cache ready');
      
      await this.bot.start();
      console.log('✅ Advanced AI Trading Bot started successfully!');
      return true;
    } catch (error: any) {
      console.error('❌ Failed to start bot:', error);
      throw error;
    }
  }

  async stop() {
    try {
      await this.bot.stop();
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      console.log('✅ Advanced AI Trading Bot stopped');
      return true;
    } catch (error: any) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }
}

// Export and auto-start
export const advancedTradingBot = new AdvancedTradingBot();

if (require.main === module) {
  advancedTradingBot.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\\n🔄 Shutting down...');
    advancedTradingBot.stop().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    advancedTradingBot.stop().then(() => process.exit(0));
  });
}