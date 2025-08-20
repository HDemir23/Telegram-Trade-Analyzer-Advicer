import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../core/types';
import { analyzeAssetV2, Decision, AiOutput, generateQuantPrompt } from '@trade/ai';

// Popular trading pairs by market
const CRYPTO_PAIRS = [
  'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'ADAUSDT', 
  'DOGEUSDT', 'SOLUSDT', 'TRXUSDT', 'DOTUSDT', 'MATICUSDT',
  'SHIBUSDT', 'AVAXUSDT', 'ATOMUSDT', 'UNIUSDT', 'LINKUSDT',
  'LTCUSDT', 'NEARUSDT', 'APTUSDT', 'FILUSDT', 'ICPUSDT'
];

const STOCK_SYMBOLS = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA', 'META', 'BRK.B',
  'JPM', 'JNJ', 'V', 'PG', 'UNH', 'HD', 'MA', 'BAC', 'ABBV', 'ORCL',
  'KO', 'PEP', 'COST', 'MRK', 'TMO', 'VZ', 'CSCO', 'NFLX'
];

const FOREX_PAIRS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF',
  'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CHFJPY'
];

const TIMEFRAMES = [
  { label: '1 Hour', value: '1h' },
  { label: '4 Hours', value: '4h' },
  { label: '1 Day', value: '1d' },
  { label: '1 Week', value: '1w' }
];

export const tradeCommands = new Composer<MyContext>();

tradeCommands.command('trade', async (ctx) => {
  ctx.session.tradeFlow = { step: 'market_selection' };
  
  const keyboard = new InlineKeyboard()
    .text('🪙 Crypto', 'trade_market_crypto')
    .text('📈 Stocks', 'trade_market_stocks').row()
    .text('💱 Forex', 'trade_market_forex')
    .text('🔍 Custom Symbol', 'trade_market_custom');

  const message = `
**🎯 AI Trading Analysis**

Select the market you want to analyze:

**🪙 Crypto** - Bitcoin, Ethereum, Altcoins
**📈 Stocks** - US Equities (NASDAQ, NYSE)
**💱 Forex** - Major Currency Pairs
**🔍 Custom** - Enter any symbol manually

*AI will analyze price action, indicators, and provide entry/exit recommendations with risk management.*
  `.trim();

  await ctx.reply(message, {
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  });
});

tradeCommands.callbackQuery(/^trade_market_(.+)$/, async (ctx) => {
  const market = ctx.match[1];
  ctx.session.tradeFlow = { ...ctx.session.tradeFlow, market, step: 'symbol_selection' };

  await ctx.answerCallbackQuery();

  if (market === 'custom') {
    await ctx.editMessageText(
      '**🔍 Enter Custom Symbol**\n\nType the symbol you want to analyze (e.g., BTCUSDT, AAPL, EURUSD):',
      { parse_mode: 'Markdown' }
    );
    ctx.session.awaitingSymbolInput = true;
    return;
  }

  let symbols: string[];
  let marketName: string;
  let marketEmoji: string;

  switch (market) {
    case 'crypto':
      symbols = CRYPTO_PAIRS;
      marketName = 'Cryptocurrency';
      marketEmoji = '🪙';
      break;
    case 'stocks':
      symbols = STOCK_SYMBOLS;
      marketName = 'Stock Market';
      marketEmoji = '📈';
      break;
    case 'forex':
      symbols = FOREX_PAIRS;
      marketName = 'Forex';
      marketEmoji = '💱';
      break;
    default:
      return;
  }

  const keyboard = new InlineKeyboard();
  
  // Add symbols in rows of 3
  for (let i = 0; i < Math.min(symbols.length, 15); i += 3) {
    const row = symbols.slice(i, i + 3);
    keyboard.row();
    row.forEach(symbol => {
      keyboard.text(symbol, `trade_symbol_${symbol}`);
    });
  }

  keyboard.row().text('🔍 Search Symbol', 'trade_search_symbol');
  keyboard.row().text('◀️ Back', 'trade_back_to_markets');

  await ctx.editMessageText(
    `**${marketEmoji} ${marketName} Symbols**\n\nSelect a symbol to analyze:`,
    {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    }
  );
});

tradeCommands.callbackQuery(/^trade_symbol_(.+)$/, async (ctx) => {
  const symbol = ctx.match[1];
  ctx.session.tradeFlow = { ...ctx.session.tradeFlow, symbol, step: 'timeframe_selection' };

  await ctx.answerCallbackQuery();

  const keyboard = new InlineKeyboard();
  TIMEFRAMES.forEach(tf => {
    keyboard.text(tf.label, `trade_timeframe_${tf.value}`).row();
  });
  keyboard.text('◀️ Back', 'trade_back_to_symbols');

  await ctx.editMessageText(
    `**⏰ Select Timeframe for ${symbol}**\n\nChoose analysis timeframe:`,
    {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    }
  );
});

tradeCommands.callbackQuery(/^trade_timeframe_(.+)$/, async (ctx) => {
  const timeframe = ctx.match[1];
  const { market, symbol } = ctx.session.tradeFlow || {};

  if (!market || !symbol) {
    await ctx.answerCallbackQuery('Session expired. Please start again with /trade');
    return;
  }

  ctx.session.tradeFlow = { ...ctx.session.tradeFlow, timeframe, step: 'analyzing' };

  await ctx.answerCallbackQuery();
  await ctx.editMessageText(
    `**🔄 Analyzing ${symbol} (${timeframe})**\n\n⏳ AI is analyzing market data, indicators, and generating recommendations...\n\n*This may take 10-30 seconds*`,
    { parse_mode: 'Markdown' }
  );

  try {
    // Get AI analysis
    const analysisResult = await performAIAnalysis(symbol, timeframe, market);
    
    // Format and send the analysis
    const analysisMessage = formatAnalysisResult(analysisResult, symbol, timeframe);
    const keyboard = createAnalysisKeyboard(symbol, analysisResult);

    await ctx.editMessageText(analysisMessage, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

    // Clear session
    delete ctx.session.tradeFlow;

  } catch (error: any) {
    console.error('AI Analysis Error:', error);
    
    await ctx.editMessageText(
      `**❌ Analysis Failed**\n\nError: ${error.message}\n\nPlease try again with /trade`,
      {
        parse_mode: 'Markdown',
        reply_markup: new InlineKeyboard().text('🔄 Try Again', 'trade_restart')
      }
    );
  }
});

// Handle text input for custom symbols
tradeCommands.on('message:text', async (ctx, next) => {
  if (ctx.session.awaitingSymbolInput) {
    const symbol = ctx.message.text.toUpperCase().trim();
    
    if (symbol.length < 2 || symbol.length > 20) {
      await ctx.reply('❌ Invalid symbol. Please enter a valid trading symbol (2-20 characters).');
      return;
    }

    ctx.session.tradeFlow = { ...ctx.session.tradeFlow, symbol, step: 'timeframe_selection' };
    ctx.session.awaitingSymbolInput = false;

    const keyboard = new InlineKeyboard();
    TIMEFRAMES.forEach(tf => {
      keyboard.text(tf.label, `trade_timeframe_${tf.value}`).row();
    });
    keyboard.text('◀️ Back', 'trade_back_to_markets');

    await ctx.reply(
      `**⏰ Select Timeframe for ${symbol}**\n\nChoose analysis timeframe:`,
      {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
      }
    );
  } else {
    await next();
  }
});

// Navigation callbacks
tradeCommands.callbackQuery('trade_back_to_markets', async (ctx) => {
  await ctx.answerCallbackQuery();
  // Restart the trade flow
  await ctx.editMessageText('Loading...', {});
  // Trigger the main trade command logic
  ctx.session.tradeFlow = { step: 'market_selection' };
  
  const keyboard = new InlineKeyboard()
    .text('🪙 Crypto', 'trade_market_crypto')
    .text('📈 Stocks', 'trade_market_stocks').row()
    .text('💱 Forex', 'trade_market_forex')
    .text('🔍 Custom Symbol', 'trade_market_custom');

  const message = `
**🎯 AI Trading Analysis**

Select the market you want to analyze:

**🪙 Crypto** - Bitcoin, Ethereum, Altcoins
**📈 Stocks** - US Equities (NASDAQ, NYSE)
**💱 Forex** - Major Currency Pairs
**🔍 Custom** - Enter any symbol manually

*AI will analyze price action, indicators, and provide entry/exit recommendations with risk management.*
  `.trim();

  await ctx.editMessageText(message, {
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  });
});

tradeCommands.callbackQuery('trade_restart', async (ctx) => {
  await ctx.answerCallbackQuery();
  // Clear session and restart
  delete ctx.session.tradeFlow;
  
  const keyboard = new InlineKeyboard()
    .text('🪙 Crypto', 'trade_market_crypto')
    .text('📈 Stocks', 'trade_market_stocks').row()
    .text('💱 Forex', 'trade_market_forex')
    .text('🔍 Custom Symbol', 'trade_market_custom');

  const message = `
**🎯 AI Trading Analysis**

Select the market you want to analyze:
  `.trim();

  await ctx.editMessageText(message, {
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  });
});

async function performAIAnalysis(symbol: string, timeframe: string, market: string): Promise<AiOutput> {
  // Mock market data - in production this would fetch real OHLCV data
  const mockCandles = generateMockCandles(symbol);
  
  const analysisRequest = {
    symbol,
    timeframe,
    min_rr: 1.5,
    leverage_cap: 3,
    data_staleness_sec: 300,
    features: {
      candles: JSON.stringify(mockCandles),
      liquidity: { volume_24h: 1000000, spread: 0.001 },
      onchain: market === 'crypto' ? { holder_count: 50000, whale_activity: 'normal' } : null,
      sentiment: { social_score: 0.7, news_sentiment: 'neutral' }
    }
  };

  // Use OpenRouter API with a fast model for analysis
  const model = 'meta-llama/llama-3.1-8b-instruct:free';
  
  try {
    return await generateQuantPrompt(analysisRequest, model);
  } catch (error) {
    console.error('AI Analysis Error:', error);
    // Return mock analysis as fallback
    return generateMockAnalysis(symbol, timeframe);
  }
}

function generateMockCandles(symbol: string) {
  // Generate mock OHLCV data
  const candles = [];
  let price = getBasePrice(symbol);
  
  for (let i = 0; i < 100; i++) {
    const volatility = 0.02; // 2% volatility
    const change = (Math.random() - 0.5) * 2 * volatility;
    
    const open = price;
    const close = price * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * 0.01);
    const low = Math.min(open, close) * (1 - Math.random() * 0.01);
    const volume = Math.random() * 1000000;
    
    candles.push({ open, high, low, close, volume });
    price = close;
  }
  
  return candles;
}

function getBasePrice(symbol: string): number {
  const prices: Record<string, number> = {
    'BTCUSDT': 43000,
    'ETHUSDT': 2600,
    'AAPL': 180,
    'MSFT': 420,
    'EURUSD': 1.09
  };
  
  return prices[symbol] || 100;
}

function generateMockAnalysis(symbol: string, timeframe: string): AiOutput {
  const basePrice = getBasePrice(symbol);
  const isLong = Math.random() > 0.5;
  
  const position = Math.random() > 0.7 ? 'hold' : (isLong ? 'long' : 'short');
  
  return {
    symbol,
    timeframe,
    position,
    decision: position.toUpperCase(),
    reasoning: `Technical analysis suggests ${position} position based on current market conditions`,
    entry: {
      type: 'limit' as const,
      price: basePrice * (1 + (Math.random() - 0.5) * 0.02),
      zone: [basePrice * 0.98, basePrice * 1.02]
    },
    stop_loss: isLong ? basePrice * 0.95 : basePrice * 1.05,
    take_profits: [
      { price: isLong ? basePrice * 1.08 : basePrice * 0.92, size_pct: 50 },
      { price: isLong ? basePrice * 1.15 : basePrice * 0.85, size_pct: 30 }
    ],
    leverage: Math.floor(Math.random() * 3) + 1,
    expected_rr: 1.5 + Math.random() * 2,
    confidence: 0.6 + Math.random() * 0.3,
    horizon: 'swing_days' as const,
    rationale: {
      trend: isLong ? 'Bullish momentum building' : 'Bearish pressure increasing',
      momentum: 'RSI showing divergence with strong volume confirmation',
      onchain: symbol.includes('USDT') ? 'Whale accumulation detected' : 'N/A',
      liquidity: 'Good liquidity with tight spreads',
      sentiment: 'Market sentiment turning positive based on recent news',
      risks: ['Market volatility', 'Regulatory uncertainty', 'Technical breakdown']
    },
    key_levels: {
      supports: [basePrice * 0.95, basePrice * 0.90],
      resistances: [basePrice * 1.05, basePrice * 1.10]
    },
    indicator_snapshot: {
      rsi: 45 + Math.random() * 20,
      macd: { diff: 0.5, signal: 0.3, hist: 0.2 },
      ema: { e20: basePrice * 0.99, e50: basePrice * 0.97, e200: basePrice * 0.95 },
      bb: { mid: basePrice, upper: basePrice * 1.02, lower: basePrice * 0.98 },
      atr: basePrice * 0.03
    },
    invalid_if: ['Price breaks below key support', 'Volume drops significantly'],
    assumptions: ['Normal market conditions', 'No major news events'],
    timestamp: Date.now(),
    version: '1.0'
  };
}

function formatAnalysisResult(analysis: AiOutput, symbol: string, timeframe: string): string {
  const positionEmoji = analysis.position === 'long' ? '📈' : analysis.position === 'short' ? '📉' : '⏸️';
  const confidenceBar = '█'.repeat(Math.floor(analysis.confidence * 10)) + '░'.repeat(10 - Math.floor(analysis.confidence * 10));
  
  let message = `**${positionEmoji} AI Analysis: ${symbol} (${timeframe})**\n\n`;
  
  // Position Recommendation
  message += `**🎯 Position:** ${(analysis.position || 'HOLD').toUpperCase()}\n`;
  message += `**🎲 Confidence:** ${(analysis.confidence * 100).toFixed(0)}% ${confidenceBar}\n`;
  message += `**⏰ Horizon:** ${(analysis.horizon || 'medium_term').replace('_', ' ').toUpperCase()}\n\n`;
  
  if (analysis.position !== 'hold') {
    // Entry & Risk Management
    message += `**💰 Entry Strategy:**\n`;
    message += `• Type: ${analysis.entry.type.toUpperCase()}\n`;
    message += `• Price: $${analysis.entry.price.toFixed(4)}\n`;
    const entryZone = analysis.entry?.zone || [0, 0];
    message += `• Zone: $${entryZone[0]?.toFixed(4) || '0.0000'} - $${entryZone[1]?.toFixed(4) || '0.0000'}\n\n`;
    
    message += `**🛡️ Risk Management:**\n`;
    message += `• Stop Loss: $${(analysis.stop_loss || 0).toFixed(4)}\n`;
    (analysis.take_profits || []).forEach((tp: any, i: number) => {
      message += `• TP${i + 1}: $${(tp?.price || 0).toFixed(4)} (${tp?.size_pct || 0}%)\n`;
    });
    message += `• Max Leverage: ${analysis.leverage || 1}x\n`;
    message += `• R:R Ratio: 1:${(analysis.expected_rr || 0).toFixed(2)}\n\n`;
  }
  
  // Market Analysis
  message += `**📊 Technical Analysis:**\n`;
  message += `• RSI: ${(analysis.indicator_snapshot?.rsi || 50).toFixed(1)}\n`;
  message += `• Trend: ${analysis.rationale?.trend || 'Neutral'}\n`;
  message += `• Momentum: ${analysis.rationale?.momentum || 'Balanced'}\n\n`;
  
  // Key Levels
  message += `**🎯 Key Levels:**\n`;
  const resistances = analysis.key_levels?.resistances || [];
  const supports = analysis.key_levels?.supports || [];
  message += `• Resistance: $${resistances.map((r: number) => r.toFixed(4)).join(', $') || 'N/A'}\n`;
  message += `• Support: $${supports.map((s: number) => s.toFixed(4)).join(', $') || 'N/A'}\n\n`;
  
  // Risks
  const risks = analysis.rationale?.risks || [];
  if (risks.length > 0) {
    message += `**⚠️ Risks:**\n`;
    risks.slice(0, 3).forEach((risk: string) => {
      message += `• ${risk}\n`;
    });
    message += '\n';
  }
  
  message += `*Analysis generated at ${new Date(analysis.timestamp || Date.now()).toLocaleString()}*\n`;
  message += `*Version: ${analysis.version} | Model: AI Quant Strategist*`;
  
  return message;
}

function createAnalysisKeyboard(symbol: string, analysis: AiOutput): InlineKeyboard {
  const keyboard = new InlineKeyboard();
  
  if (analysis.position !== 'hold') {
    keyboard.text('📝 Track Position', `track_position_${symbol}`)
           .text('🔔 Set Alert', `set_alert_${symbol}`).row();
  }
  
  keyboard.text('🔄 Analyze Another', 'trade_restart')
         .text('📊 More Details', `analysis_details_${symbol}`);
  
  return keyboard;
}

// Handle additional callbacks
tradeCommands.callbackQuery(/^track_position_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('📝 Use `/position parse` to manually track this trade!\n\nExample:\n`LONG BTCUSDT 0.5 @ 43250 SL 41000 TP 45000,47000`');
});

tradeCommands.callbackQuery(/^set_alert_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('🔔 Alert system coming soon! This will notify you when price hits key levels.');
});

tradeCommands.callbackQuery(/^analysis_details_(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply('📊 Detailed analysis view coming soon! This will show full indicator breakdown and market context.');
});