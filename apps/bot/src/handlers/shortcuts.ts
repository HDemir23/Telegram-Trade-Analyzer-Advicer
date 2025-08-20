// User-friendly command shortcuts for Telegram Bot
import { MyContext } from '../core/types';
import { analyzeAssetV2 } from '@trade/ai/src/core/main-orchestrator';

// Popular crypto shortcuts
export async function handleBTCCommand(ctx: MyContext) {
  await quickAnalyze(ctx, 'BTCUSDT', '🟠 Bitcoin');
}

export async function handleETHCommand(ctx: MyContext) {
  await quickAnalyze(ctx, 'ETHUSDT', '💎 Ethereum');
}

export async function handleSOLCommand(ctx: MyContext) {
  await quickAnalyze(ctx, 'SOLUSDT', '🌞 Solana');
}

// Popular stocks shortcuts  
export async function handleAAPLCommand(ctx: MyContext) {
  await quickAnalyze(ctx, 'AAPL', '🍎 Apple');
}

export async function handleMSFTCommand(ctx: MyContext) {
  await quickAnalyze(ctx, 'MSFT', '🪟 Microsoft');
}

export async function handleTSLACommand(ctx: MyContext) {
  await quickAnalyze(ctx, 'TSLA', '🚗 Tesla');
}

// Quick analysis helper
async function quickAnalyze(ctx: MyContext, symbol: string, displayName: string) {
  try {
    await ctx.replyWithChatAction('typing');
    
    const startTime = Date.now();
    const decision = await analyzeAssetV2(symbol, 'openai/gpt-4o-mini'); // Use fast model for shortcuts
    const analysisTime = Date.now() - startTime;
    
    const emoji = getPositionEmoji(decision.position);
    const confidence = Math.round(decision.confidence * 100);
    const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
    
    let response = `${emoji} **${displayName} Quick Analysis**\n\n`;
    response += `📊 **Signal:** ${decision.position.toUpperCase()} ${riskColor}\n`;
    response += `🎯 **Confidence:** ${confidence}%\n`;
    response += `💭 **AI Says:** "${decision.rationale.substring(0, 120)}..."\n\n`;
    
    if (decision.position !== 'hold') {
      response += `💰 **Entry:** $${decision.entry.lower?.toFixed(4)} - $${decision.entry.upper?.toFixed(4)}\n`;
      response += `🛡️ **Stop:** $${decision.stop?.toFixed(4)}\n`;
      response += `🎯 **Target:** $${decision.targets[0]?.price?.toFixed(4)}\n`;
      response += `⚖️ **R:R:** ${decision.realized_rr_est}:1\n\n`;
    }
    
    response += `⚡ **Analysis time:** ${analysisTime}ms\n`;
    response += `🤖 **Model:** GPT-4o-mini`;
    
    const keyboard = {
      inline_keyboard: [[
        { text: '📊 Full Analysis', callback_data: `v2_full_${symbol}` },
        { text: '🔄 Refresh', callback_data: `v2_quick_${symbol}` }
      ]]
    };
    
    await ctx.reply(response, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
    
  } catch (error: any) {
    console.error(`Quick analysis failed for ${symbol}:`, error);
    await ctx.reply(`❌ ${displayName} analysis failed. Try again or use \`/v2 ${symbol}\` for detailed analysis.`, {
      parse_mode: 'Markdown'
    });
  }
}

function getPositionEmoji(position: string): string {
  switch (position) {
    case 'long': return '📈';
    case 'short': return '📉';
    case 'hold': return '⏸️';
    default: return '❓';
  }
}

// Market overview shortcuts
export async function handleCryptoCommand(ctx: MyContext) {
  await marketOverview(ctx, ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT'], '🚀 Crypto Market');
}

export async function handleStocksCommand(ctx: MyContext) {
  await marketOverview(ctx, ['AAPL', 'MSFT', 'GOOGL', 'TSLA'], '📈 Tech Stocks');
}

async function marketOverview(ctx: MyContext, symbols: string[], title: string) {
  try {
    await ctx.replyWithChatAction('typing');
    const processingMsg = await ctx.reply(`🔍 Scanning ${title.toLowerCase()}...`);
    
    const startTime = Date.now();
    const results = await Promise.allSettled(
      symbols.map(symbol => analyzeAssetV2(symbol, 'openai/gpt-4o-mini'))
    );
    const totalTime = Date.now() - startTime;
    
    let overview = `${title} Overview\n\n`;
    let bullish = 0, bearish = 0, neutral = 0;
    let tradeable: string[] = [];
    
    results.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled') {
        const decision = result.value;
        const emoji = getPositionEmoji(decision.position);
        const confidence = Math.round(decision.confidence * 100);
        const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
        
        overview += `${emoji} **${symbol}**: ${decision.position.toUpperCase()} (${confidence}%) ${riskColor}\n`;
        
        if (decision.position === 'long') bullish++;
        else if (decision.position === 'short') bearish++;
        else neutral++;
        
        if (decision.position !== 'hold' && confidence > 65) {
          tradeable.push(symbol);
        }
      } else {
        overview += `❌ **${symbol}**: Analysis failed\n`;
      }
    });
    
    overview += `\n📊 **Market Sentiment:**\n`;
    overview += `📈 Bullish: ${bullish} | 📉 Bearish: ${bearish} | ⏸️ Neutral: ${neutral}\n\n`;
    
    if (tradeable.length > 0) {
      overview += `🎯 **High Confidence Signals:** ${tradeable.join(', ')}\n`;
      overview += `💡 Use \`/v2 SYMBOL\` for detailed analysis\n\n`;
    }
    
    overview += `⚡ Scanned in ${totalTime}ms`;
    
    await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, overview, {
      parse_mode: 'Markdown'
    });
    
  } catch (error: any) {
    console.error('Market overview failed:', error);
    await ctx.reply(`❌ ${title} overview failed. Please try again.`);
  }
}

// Price alert shortcuts
export async function handleWatchCommand(ctx: MyContext, args: string) {
  const params = args.trim().split(' ');
  if (params.length < 2) {
    await ctx.reply('❌ Usage: `/watch BTCUSDT 45000` or `/watch AAPL 150`', {
      parse_mode: 'Markdown'
    });
    return;
  }
  
  const symbol = params[0].toUpperCase();
  const price = parseFloat(params[1]);
  
  if (isNaN(price)) {
    await ctx.reply('❌ Invalid price. Please enter a valid number.');
    return;
  }
  
  // TODO: Implement price alerting system
  await ctx.reply(`🔔 **Price Alert Set**\n\n` +
    `📊 **Symbol:** ${symbol}\n` +
    `🎯 **Target Price:** $${price.toFixed(4)}\n` +
    `⏰ **Status:** Active\n\n` +
    `You'll be notified when ${symbol} reaches $${price.toFixed(4)}\n\n` +
    `💡 *Feature coming soon - alerts will be stored and monitored*`, {
    parse_mode: 'Markdown'
  });
}

// Portfolio shortcuts
export async function handlePortfolioCommand(ctx: MyContext) {
  // TODO: Implement portfolio tracking
  const portfolioDemo = `💼 **Your Portfolio** (Demo)\n\n` +
    `**Open Positions:**\n` +
    `📈 BTCUSDT: +$127.45 (+2.3%)\n` +
    `📉 ETHUSDT: -$43.21 (-0.8%)\n` +
    `⏸️ AAPL: $0.00 (0.0%)\n\n` +
    `**Summary:**\n` +
    `💰 Total P&L: +$84.24 (+0.7%)\n` +
    `📊 Win Rate: 67% (4/6 trades)\n` +
    `🎯 Best Trade: +$156.78 (SOLUSDT)\n` +
    `📉 Worst Trade: -$72.33 (ADAUSDT)\n\n` +
    `**Quick Actions:**\n` +
    `• \`/positions\` - View all positions\n` +
    `• \`/pnl\` - Detailed P&L report\n` +
    `• \`/trades\` - Trade history\n\n` +
    `💡 *Portfolio tracking coming soon*`;
  
  await ctx.reply(portfolioDemo, { parse_mode: 'Markdown' });
}

// Help shortcuts
export async function handleQuickHelpCommand(ctx: MyContext) {
  const quickHelp = `⚡ **Quick Commands**

**Instant Analysis:**
\`/btc\` \`/eth\` \`/sol\` - Crypto
\`/aapl\` \`/msft\` \`/tsla\` - Stocks

**Market Overviews:**
\`/crypto\` - Top 4 crypto overview
\`/stocks\` - Tech stocks overview

**V2 Analysis:**
\`/v2 SYMBOL\` - Full analysis
\`/quick SYMBOL\` - Fast analysis
\`/v2batch BTC,ETH,SOL\` - Multiple

**Utilities:**
\`/watch SYMBOL PRICE\` - Price alerts
\`/portfolio\` - Your positions
\`/settings\` - Bot preferences

**Pro Tips:**
💡 Add model: \`/v2 BTCUSDT model=gpt4mini\`
💡 Quick format: \`/v2 AAPL format=quick\`
💡 Compare: \`/v2compare BTCUSDT vs ETHUSDT\`

Type any command to get started! 🚀`;

  await ctx.reply(quickHelp, { parse_mode: 'Markdown' });
}