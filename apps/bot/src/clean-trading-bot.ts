// 🚀 Advanced AI Trading Bot - Market Analysis with Profitable Positions
import { Bot, session, Context, SessionFlavor, InlineKeyboard } from 'grammy';
import dotenv from 'dotenv';
import path from 'path';

import { botConfig } from './config';

// Import AI systems
import { 
  analyzeAssetV2, 
  marketDataCache,
  toCompactLines,
  MultiFunnelOrchestrator
} from '@trade/ai';

interface SessionData {
  userId?: number;
  currentModel?: string;
  format?: 'compact' | 'detailed' | 'signals';
  riskLevel?: 'conservative' | 'moderate' | 'aggressive';
}

type MyContext = Context & SessionFlavor<SessionData>;

export class CleanTradingBot {
  private bot: Bot<MyContext>;
  private orchestrator = new MultiFunnelOrchestrator();

  constructor() {
    this.bot = new Bot<MyContext>(botConfig.TELEGRAM_BOT_TOKEN!);
    this.setupMiddleware();
    this.setupCommands();
    this.setupCallbacks();
  }

  private setupMiddleware() {
    this.bot.use(session({ initial: () => ({}) }));
    this.bot.use(async (ctx, next) => {
      if (!ctx.session) {
        ctx.session = {
          userId: ctx.from?.id,
          currentModel: 'openai/gpt-5-mini',
          format: 'compact',
          riskLevel: 'moderate'
        };
      }
      await next();
    });

    this.bot.catch((err) => {
      console.error('Bot error:', err.error);
      err.ctx.reply('❌ Something went wrong. Please try again.').catch(() => {});
    });
  }

  private setupCommands() {
    this.bot.command('start', async (ctx) => {
      const firstName = ctx.from?.first_name || 'Trader';
      const message = `🚀 **Welcome ${firstName}!**

🤖 **Advanced AI Trading Bot**
• Real-time market analysis
• Profitable position detection  
• AI-powered portfolio optimization

Choose your analysis:`;

      await ctx.reply(message, {
        parse_mode: 'Markdown',
        reply_markup: this.createMainMenu()
      });
    });

    // Main analysis commands
    this.bot.command('crypto', async (ctx) => this.analyzeCryptoMarkets(ctx));
    this.bot.command('stocks', async (ctx) => this.analyzeStockMarkets(ctx));
    this.bot.command('profitable', async (ctx) => this.findProfitablePositions(ctx));
    this.bot.command('portfolio', async (ctx) => this.buildPortfolio(ctx));

    // Quick commands
    this.bot.command('btc', async (ctx) => this.quickAnalysis(ctx, 'BTCUSDT', '🟠 Bitcoin'));
    this.bot.command('eth', async (ctx) => this.quickAnalysis(ctx, 'ETHUSDT', '💎 Ethereum'));
    this.bot.command('help', async (ctx) => this.showHelp(ctx));
  }

  private setupCallbacks() {
    this.bot.callbackQuery('crypto_analysis', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.analyzeCryptoMarkets(ctx, true);
    });

    this.bot.callbackQuery('stocks_analysis', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.analyzeStockMarkets(ctx, true);
    });

    this.bot.callbackQuery('profitable_positions', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.findProfitablePositions(ctx, true);
    });

    this.bot.callbackQuery('build_portfolio', async (ctx) => {
      await ctx.answerCallbackQuery();
      await this.buildPortfolio(ctx, true);
    });

    this.bot.callbackQuery('back_main', async (ctx) => {
      await ctx.answerCallbackQuery();
      await ctx.editMessageText('🏠 **Main Menu**\n\nChoose your analysis:', {
        parse_mode: 'Markdown',
        reply_markup: this.createMainMenu()
      });
    });
  }

  // 🪙 Crypto Markets Analysis
  private async analyzeCryptoMarkets(ctx: MyContext, isEdit = false) {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT'];
    
    const processingMsg = isEdit ? null : await ctx.reply('🚀 **Analyzing Crypto Markets...**\n\n🔍 Processing 6 major cryptocurrencies', { parse_mode: 'Markdown' });

    try {
      const results = await Promise.allSettled(
        symbols.map(symbol => analyzeAssetV2(symbol, ctx.session.currentModel!))
      );

      let analysis = '📊 **Crypto Market Analysis**\n\n';
      let profitable = 0;
      let signals = [];

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const symbol = symbols[i];
        
        if (result.status === 'fulfilled') {
          const decision = result.value;
          const confidence = Math.round(decision.confidence * 100);
          const emoji = this.getPositionEmoji(decision.position);
          const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
          
          analysis += `${emoji} **${symbol.replace('USDT', '')}**: ${decision.position.toUpperCase()} (${confidence}%) ${riskColor}\n`;
          
          if (decision.position !== 'hold' && confidence >= 60) {
            profitable++;
            if (ctx.session.format === 'signals') {
              try {
                signals.push(toCompactLines(decision));
              } catch (e) {
                // Skip if formatting fails
              }
            }
          }
        } else {
          analysis += `❌ **${symbol}**: Analysis failed\n`;
        }
      }

      analysis += `\n💰 **Profitable Opportunities: ${profitable}**\n`;
      analysis += `🎯 **Market Status:** ${profitable >= 3 ? 'Strong' : profitable >= 1 ? 'Moderate' : 'Weak'}\n\n`;

      if (signals.length > 0) {
        analysis += '**🔥 Top Trading Signals:**\n\n';
        signals.slice(0, 2).forEach(signal => {
          analysis += `\`\`\`\n${signal}\n\`\`\`\n`;
        });
      }

      analysis += '**💡 Next Steps:**\n';
      analysis += '• Use "💰 Profitable Positions" for detailed analysis\n';
      analysis += '• Use "📊 Build Portfolio" for optimized allocation';

      const keyboard = new InlineKeyboard()
        .text('💰 Profitable Positions', 'profitable_positions')
        .text('📊 Build Portfolio', 'build_portfolio').row()
        .text('🔄 Refresh', 'crypto_analysis')
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
      const errorMsg = `❌ **Crypto Analysis Failed**\n\n${error.message}`;
      if (isEdit) {
        await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' });
      } else if (processingMsg) {
        await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, errorMsg, { parse_mode: 'Markdown' });
      }
    }
  }

  // 📈 Stock Markets Analysis
  private async analyzeStockMarkets(ctx: MyContext, isEdit = false) {
    const symbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META'];
    
    const processingMsg = isEdit ? null : await ctx.reply('📈 **Analyzing Stock Markets...**\n\n🔍 Processing 6 major tech stocks', { parse_mode: 'Markdown' });

    try {
      const results = await Promise.allSettled(
        symbols.map(symbol => analyzeAssetV2(symbol, ctx.session.currentModel!))
      );

      let analysis = '📈 **Stock Market Analysis**\n\n';
      let bullish = 0, bearish = 0, neutral = 0;
      let profitable = 0;
      let topStock = null;
      let maxConfidence = 0;

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const symbol = symbols[i];
        
        if (result.status === 'fulfilled') {
          const decision = result.value;
          const confidence = Math.round(decision.confidence * 100);
          const emoji = this.getPositionEmoji(decision.position);
          const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
          
          analysis += `${emoji} **${symbol}**: ${decision.position.toUpperCase()} (${confidence}%) ${riskColor}\n`;
          
          if (decision.position === 'long') bullish++;
          else if (decision.position === 'short') bearish++;
          else neutral++;

          if (decision.position !== 'hold' && confidence >= 60) {
            profitable++;
            if (confidence > maxConfidence) {
              maxConfidence = confidence;
              topStock = { symbol, decision, confidence };
            }
          }
        } else {
          analysis += `❌ **${symbol}**: Analysis failed\n`;
        }
      }

      analysis += `\n📊 **Market Sentiment:**\n`;
      analysis += `📈 Bullish: ${bullish} | 📉 Bearish: ${bearish} | ⏸️ Neutral: ${neutral}\n\n`;
      analysis += `💰 **Profitable Opportunities: ${profitable}**\n`;

      if (topStock) {
        analysis += `🏆 **Top Pick: ${topStock.symbol}** (${topStock.confidence}% confidence)\n`;
        analysis += `Position: ${topStock.decision.position.toUpperCase()} | R:R: ${topStock.decision.realized_rr_est}:1\n\n`;
      }

      analysis += '**💡 Market Outlook:**\n';
      if (bullish > bearish) {
        analysis += '🟢 Overall bullish sentiment detected\n';
      } else if (bearish > bullish) {
        analysis += '🔴 Overall bearish sentiment detected\n';
      } else {
        analysis += '🟡 Mixed market signals, proceed with caution\n';
      }

      const keyboard = new InlineKeyboard()
        .text('💰 Profitable Positions', 'profitable_positions')
        .text('📊 Build Portfolio', 'build_portfolio').row()
        .text('🔄 Refresh', 'stocks_analysis')
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
      const errorMsg = `❌ **Stock Analysis Failed**\n\n${error.message}`;
      if (isEdit) {
        await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' });
      } else if (processingMsg) {
        await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, errorMsg, { parse_mode: 'Markdown' });
      }
    }
  }

  // 💰 Find Most Profitable Positions
  private async findProfitablePositions(ctx: MyContext, isEdit = false) {
    const allSymbols = [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT',
      'AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META'
    ];
    
    const processingMsg = isEdit ? null : await ctx.reply('💰 **Finding Most Profitable Positions...**\n\n🎯 Analyzing 12 top assets\n🔍 Filtering high-probability trades', { parse_mode: 'Markdown' });

    try {
      const results = await Promise.allSettled(
        allSymbols.map(symbol => analyzeAssetV2(symbol, ctx.session.currentModel!))
      );

      let profitable = [];
      
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const symbol = allSymbols[i];
        
        if (result.status === 'fulfilled') {
          const decision = result.value;
          const confidence = decision.confidence * 100;
          const rr = decision.realized_rr_est || 1;
          
          // Enhanced scoring: confidence + risk-reward + position strength
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

      let analysis = '💰 **Most Profitable Trading Positions**\n\n';
      
      if (profitable.length === 0) {
        analysis += '❌ No high-probability positions found right now.\n\n';
        analysis += '💡 **Market may be consolidating**\n';
        analysis += '• Try checking again in a few hours\n';
        analysis += '• Consider adjusting risk tolerance\n';
        analysis += '• Use individual analysis for specific assets';
      } else {
        analysis += `🎯 **Found ${profitable.length} Profitable Opportunities**\n\n`;
        
        profitable.slice(0, 5).forEach((pos, index) => {
          const emoji = this.getPositionEmoji(pos.decision.position);
          const riskColor = pos.confidence >= 75 ? '🟢' : pos.confidence >= 60 ? '🟡' : '🔴';
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
          
          analysis += `${medal} ${emoji} **${pos.symbol.replace('USDT', '')}** ${pos.market}\n`;
          analysis += `├ Position: ${pos.decision.position.toUpperCase()}\n`;
          analysis += `├ Confidence: ${pos.confidence}% ${riskColor}\n`;
          analysis += `├ Risk:Reward: ${pos.rr.toFixed(1)}:1\n`;
          analysis += `├ Score: ${pos.score}/100\n`;
          analysis += `└ Entry: $${(pos.decision.entry.lower || pos.decision.entry.price || 0).toFixed(4)}\n\n`;
        });

        // Risk level guidance
        const riskLevel = ctx.session.riskLevel;
        analysis += `⚖️ **Risk Management (${riskLevel?.toUpperCase()}):**\n`;
        if (riskLevel === 'conservative') {
          analysis += '• Focus on 75%+ confidence positions\n';
          analysis += '• Position size: 2-5% per trade\n';
          analysis += '• Strict stop-losses recommended';
        } else if (riskLevel === 'moderate') {
          analysis += '• Consider 60%+ confidence positions\n';
          analysis += '• Position size: 5-10% per trade\n';
          analysis += '• Balanced risk approach';
        } else {
          analysis += '• All shown positions suitable\n';
          analysis += '• Position size: 10-15% per trade\n';
          analysis += '• Higher risk, higher reward';
        }
      }

      const keyboard = new InlineKeyboard()
        .text('📊 Build Portfolio', 'build_portfolio')
        .text('🪙 Crypto Analysis', 'crypto_analysis').row()
        .text('📈 Stocks Analysis', 'stocks_analysis')
        .text('🔄 Refresh', 'profitable_positions').row()
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
      const errorMsg = `❌ **Profitable Position Analysis Failed**\n\n${error.message}`;
      if (isEdit) {
        await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' });
      } else if (processingMsg) {
        await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, errorMsg, { parse_mode: 'Markdown' });
      }
    }
  }

  // 📊 Build Optimal Portfolio
  private async buildPortfolio(ctx: MyContext, isEdit = false) {
    const processingMsg = isEdit ? null : await ctx.reply('📊 **Building Optimal Portfolio...**\n\n🔍 Multi-stage analysis\n⚖️ Risk-adjusted optimization\n🎯 Selecting best positions\n⏳ This may take 1-2 minutes', { parse_mode: 'Markdown' });

    try {
      const symbols = [
        'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'AVAXUSDT',
        'AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'META', 'AMZN'
      ];

      const portfolio = await this.orchestrator.executeFullFunnel(symbols, '6h', 5);
      
      let analysis = '📊 **Optimal Portfolio Constructed**\n\n';
      
      if (!portfolio.picks || portfolio.picks.length === 0) {
        analysis += '❌ No suitable portfolio positions found.\n\n';
        analysis += '**Possible reasons:**\n';
        analysis += '• Market volatility too high\n';
        analysis += '• Risk criteria too strict\n';
        analysis += '• Better opportunities may emerge later\n\n';
        analysis += '💡 Try individual market analysis or adjust settings.';
      } else {
        analysis += `🎯 **Selected ${portfolio.picks.length} Positions:**\n\n`;
        
        let totalAllocation = 0;
        portfolio.picks.forEach((pick, index) => {
          const emoji = this.getPositionEmoji(pick.position);
          const confidenceColor = pick.confidence >= 0.75 ? '🟢' : pick.confidence >= 0.6 ? '🟡' : '🔴';
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '⭐';
          
          analysis += `${medal} ${emoji} **${pick.asset.replace('USDT', '')}**\n`;
          analysis += `├ Position: ${pick.position.toUpperCase()}\n`;
          analysis += `├ Allocation: ${pick.size_pct}%\n`;
          analysis += `├ Confidence: ${Math.round(pick.confidence * 100)}% ${confidenceColor}\n`;
          analysis += `├ Expected R:R: ${pick.expected_rr.toFixed(1)}:1\n`;
          analysis += `└ ${pick.notes || 'Strong technical setup'}\n\n`;
          
          totalAllocation += pick.size_pct;
        });

        analysis += `📈 **Portfolio Statistics:**\n`;
        analysis += `├ Total Allocated: ${totalAllocation}%\n`;
        analysis += `├ Cash Reserve: ${100 - totalAllocation}%\n`;
        analysis += `├ Diversification: Multiple sectors\n`;
        analysis += `└ Risk Level: ${ctx.session.riskLevel?.toUpperCase()}\n\n`;

        analysis += `⚠️ **Important Notes:**\n`;
        analysis += `• Portfolio optimized for current market conditions\n`;
        analysis += `• Includes built-in risk management\n`;
        analysis += `• Educational analysis only - not financial advice\n`;
        analysis += `• Always do your own research before investing`;
      }

      const keyboard = new InlineKeyboard()
        .text('💰 Profitable Positions', 'profitable_positions')
        .text('🔄 Rebuild Portfolio', 'build_portfolio').row()
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
      const errorMsg = `❌ **Portfolio Construction Failed**\n\n${error.message}\n\nTry individual market analysis instead.`;
      if (isEdit) {
        await ctx.editMessageText(errorMsg, { parse_mode: 'Markdown' });
      } else if (processingMsg) {
        await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, errorMsg, { parse_mode: 'Markdown' });
      }
    }
  }

  // Quick individual analysis
  private async quickAnalysis(ctx: MyContext, symbol: string, displayName: string) {
    try {
      await ctx.replyWithChatAction('typing');
      const processingMsg = await ctx.reply(`🔍 **Analyzing ${displayName}...**`, { parse_mode: 'Markdown' });
      
      const decision = await analyzeAssetV2(symbol, ctx.session.currentModel!);
      const confidence = Math.round(decision.confidence * 100);
      const emoji = this.getPositionEmoji(decision.position);
      const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
      
      let response = `${emoji} **${displayName} Analysis**\n\n`;
      response += `📊 **Position:** ${decision.position.toUpperCase()}\n`;
      response += `${riskColor} **Confidence:** ${confidence}%\n`;
      response += `💭 **Rationale:** ${decision.rationale}\n\n`;
      
      if (decision.position !== 'hold') {
        response += `💰 **Trading Details:**\n`;
        response += `├ Entry: $${(decision.entry.lower || decision.entry.price || 0).toFixed(4)} - $${(decision.entry.upper || decision.entry.price || 0).toFixed(4)}\n`;
        response += `├ Stop Loss: $${(decision.stop || 0).toFixed(4)}\n`;
        response += `├ Target: $${decision.targets?.[0]?.price?.toFixed(4) || 'N/A'}\n`;
        response += `└ Risk:Reward: ${decision.realized_rr_est}:1\n\n`;
        
        if (ctx.session.format === 'signals') {
          try {
            const signal = toCompactLines(decision);
            response += `**🔥 Trading Signal:**\n\`\`\`\n${signal}\n\`\`\``;
          } catch (e) {
            // Skip signal format if fails
          }
        }
      }

      const keyboard = new InlineKeyboard()
        .text('💰 More Opportunities', 'profitable_positions')
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

  private async showHelp(ctx: MyContext) {
    const help = `📚 **Advanced AI Trading Bot - Help**

**🔥 Main Features:**
• \`/crypto\` - Crypto market analysis (6 assets)
• \`/stocks\` - Stock market analysis (6 assets) 
• \`/profitable\` - Find most profitable positions (12 assets)
• \`/portfolio\` - Build optimal portfolio with AI

**⚡ Quick Analysis:**
• \`/btc\` - Bitcoin analysis
• \`/eth\` - Ethereum analysis  
• \`/help\` - Show this help

**🤖 AI-Powered Features:**
• Real-time market data processing
• Advanced profitable position detection
• Multi-stage portfolio optimization
• Risk-adjusted position sizing

**📊 Analysis Types:**
• **Crypto Markets**: 6 major cryptocurrencies
• **Stock Markets**: 6 major tech stocks
• **Profitable Positions**: Best opportunities across all markets
• **Optimal Portfolio**: AI-constructed diversified portfolio

**💡 Pro Tips:**
• Use button interface for easier navigation
• All analysis includes confidence scores and risk indicators
• Portfolio optimization includes correlation analysis
• Educational purposes only - always do your own research

Press any button to get started!`;

    await ctx.reply(help, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard().text('🏠 Main Menu', 'back_main')
    });
  }

  // Utility methods
  private createMainMenu(): InlineKeyboard {
    return new InlineKeyboard()
      .text('🪙 Crypto Markets', 'crypto_analysis')
      .text('📈 Stock Markets', 'stocks_analysis').row()
      .text('💰 Profitable Positions', 'profitable_positions').row()
      .text('📊 Build Portfolio', 'build_portfolio');
  }

  private getPositionEmoji(position: string): string {
    switch (position) {
      case 'long': return '📈';
      case 'short': return '📉';
      case 'hold': return '⏸️';
      default: return '❓';
    }
  }

  // Bot control methods
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
      console.log('✅ Bot stopped');
      return true;
    } catch (error: any) {
      console.error('❌ Error during shutdown:', error);
      throw error;
    }
  }
}

// Export and auto-start
export const cleanTradingBot = new CleanTradingBot();

if (require.main === module) {
  cleanTradingBot.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🔄 Shutting down...');
    cleanTradingBot.stop().then(() => process.exit(0));
  });
  process.on('SIGTERM', () => {
    cleanTradingBot.stop().then(() => process.exit(0));
  });
}