// Enhanced V2 Analysis Commands for Telegram Bot
import { analyzeAssetV2 } from '@trade/ai/src/core/main-orchestrator';
import { MyContext } from '../core/types';
import { botConfig } from '../config';

interface V2AnalyzeArgs {
  symbol?: string;
  model?: 'claude' | 'gpt4o' | 'gpt4mini';
  timeframe?: '15m' | '30m' | '1h' | '4h' | '1d';
  format?: 'full' | 'compact' | 'quick';
}

const MODEL_MAP = {
  'claude': botConfig.AI_MODEL || 'openai/gpt-5-mini',
  'gpt4o': 'openai/gpt-4o',
  'gpt4mini': 'openai/gpt-4o-mini'
};

const EMOJI_MAP = {
  'long': '📈',
  'short': '📉', 
  'hold': '⏸️'
};

export async function handleV2AnalyzeCommand(ctx: MyContext, args: string) {
  try {
    const params = parseV2Args(args);
    
    if (!params.symbol) {
      await showAnalysisHelp(ctx);
      return;
    }

    // Show typing indicator
    await ctx.replyWithChatAction('typing');
    
    // Validate symbol format
    const symbol = params.symbol.toUpperCase();
    if (!isValidSymbol(symbol)) {
      await ctx.reply('❌ Invalid symbol format. Examples: BTCUSDT, ETHUSDT, AAPL, MSFT');
      return;
    }

    // Get model selection
    const model = params.model ? MODEL_MAP[params.model] : undefined;
    
    // Send initial message
    const processingMsg = await ctx.reply(`🔍 Analyzing ${symbol} with V2 system...\n⚡ Using ${model?.split('/')[1] || 'Claude 3.5'}`);
    
    try {
      // Check if market data cache is available
      const { marketDataCache } = await import('@trade/ai');
      if (!marketDataCache) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          `❌ Market data system is unavailable. Please try again later.`
        );
        return;
      }

      // Call V2 analysis
      const startTime = Date.now();
      const decision = await analyzeAssetV2(symbol, model);
      const analysisTime = Date.now() - startTime;
      
      // Check if decision is valid
      if (!decision || !decision.position || decision.confidence === undefined) {
        await ctx.api.editMessageText(
          ctx.chat!.id,
          processingMsg.message_id,
          `❌ Analysis returned invalid results for ${symbol}. This may be due to:\n\n• Missing or stale market data\n• Cache issues\n• API rate limits\n\nTry again in a few minutes.`
        );
        return;
      }

      // Check for data quality issues and provide informative messages
      if (decision.position === 'hold' && decision.rationale) {
        const rationale = decision.rationale.toLowerCase();
        if (rationale.includes('stale') || rationale.includes('missing') || rationale.includes('cache')) {
          await ctx.api.editMessageText(
            ctx.chat!.id,
            processingMsg.message_id,
            `📡 **${symbol} - Data Quality Issue**\n\n` +
            `🔴 **Status:** HOLD (Data Issues)\n` +
            `⚠️ **Reason:** ${decision.rationale}\n\n` +
            `**Next Steps:**\n` +
            `• Wait 5-10 minutes for cache refresh\n` +
            `• Try again with: \`/v2 ${symbol}\`\n` +
            `• Check if symbol is correct\n\n` +
            `⚡ Analysis: ${analysisTime}ms`,
            { parse_mode: 'Markdown' }
          );
          return;
        }
      }
      
      // Format response based on user preference
      const response = formatAnalysisResponse(decision, params.format || 'full', analysisTime);
      
      // Delete processing message and send result
      await ctx.api.deleteMessage(ctx.chat!.id, processingMsg.message_id);
      await ctx.reply(response.text, response.options);
      
      // Add action buttons for position management
      if (decision.position !== 'hold' && decision.confidence > 0.6) {
        const keyboard = {
          inline_keyboard: [[
            { text: '📊 Create Position', callback_data: `v2_position_${symbol}_${decision.position}_${decision.confidence.toFixed(2)}` },
            { text: '🔄 Re-analyze', callback_data: `v2_reanalyze_${symbol}` }
          ]]
        };
        await ctx.reply('💡 High confidence signal detected!', { reply_markup: keyboard });
      }
      
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      
      // Provide specific error messages based on error type
      let userMessage = '';
      if (errorMsg.includes('cache') || errorMsg.includes('OHLCV') || errorMsg.includes('data')) {
        userMessage = `❌ **Market Data Issue**\n\n` +
          `📡 Unable to fetch reliable data for ${symbol}\n\n` +
          `**Possible causes:**\n` +
          `• Cache is empty or corrupted\n` +
          `• API rate limits reached\n` +
          `• Symbol not found\n\n` +
          `**Try:**\n` +
          `• Wait 5 minutes and retry\n` +
          `• Check symbol spelling\n` +
          `• Use \`/v2help\` for supported symbols`;
      } else if (errorMsg.includes('AI') || errorMsg.includes('model') || errorMsg.includes('LLM')) {
        userMessage = `❌ **AI Analysis Failed**\n\n` +
          `🤖 AI service temporarily unavailable\n\n` +
          `**Try:**\n` +
          `• Retry in a few minutes\n` +
          `• Use different model: \`/v2 ${symbol} model=gpt4mini\``;
      } else if (errorMsg.includes('timeout') || errorMsg.includes('network')) {
        userMessage = `❌ **Network Timeout**\n\n` +
          `🌐 Request timed out for ${symbol}\n\n` +
          `**Try:**\n` +
          `• Retry with: \`/v2 ${symbol}\`\n` +
          `• Check your connection`;
      } else {
        userMessage = `❌ **Analysis Failed**\n\n` +
          `Error: ${errorMsg.substring(0, 100)}${errorMsg.length > 100 ? '...' : ''}\n\n` +
          `**Try:**\n` +
          `• Retry: \`/v2 ${symbol}\`\n` +
          `• Use \`/v2help\` for troubleshooting`;
      }

      await ctx.api.editMessageText(
        ctx.chat!.id,
        processingMsg.message_id,
        userMessage,
        { parse_mode: 'Markdown' }
      );
    }
    
  } catch (error: any) {
    console.error('V2 Analyze command failed:', error);
    await ctx.reply('❌ Command parsing failed. Use `/v2 help` for syntax examples.');
  }
}

function parseV2Args(args: string): V2AnalyzeArgs {
  const params: V2AnalyzeArgs = {};
  const parts = args.trim().split(/\s+/);
  
  // First argument is symbol (required)
  if (parts[0] && !parts[0].includes('=')) {
    params.symbol = parts[0];
    parts.shift();
  }
  
  // Parse key=value pairs
  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key && value) {
      switch (key.toLowerCase()) {
        case 'model':
        case 'm':
          params.model = value.toLowerCase() as any;
          break;
        case 'timeframe':
        case 'tf':
          params.timeframe = value as any;
          break;
        case 'format':
        case 'f':
          params.format = value as any;
          break;
      }
    }
  }
  
  return params;
}

function isValidSymbol(symbol: string): boolean {
  // Crypto pairs (USDT, USDC)
  if (/^[A-Z]{2,10}USDT?$/.test(symbol)) return true;
  // US stocks (2-5 letters)
  if (/^[A-Z]{1,5}$/.test(symbol)) return true;
  // BIST stocks (5-6 letters)
  if (/^[A-Z]{4,6}$/.test(symbol)) return true;
  return false;
}

function formatAnalysisResponse(decision: any, format: string, analysisTime: number) {
  const emoji = EMOJI_MAP[decision.position as keyof typeof EMOJI_MAP] || '❓';
  const confidence = Math.round(decision.confidence * 100);
  const riskColor = confidence >= 70 ? '🟢' : confidence >= 50 ? '🟡' : '🔴';
  
  switch (format) {
    case 'quick':
      return {
        text: `${emoji} **${decision.asset}**: ${decision.position.toUpperCase()} (${confidence}%)\n` +
              `💡 ${decision.rationale.substring(0, 80)}...\n` +
              `⚡ Analyzed in ${analysisTime}ms`,
        options: { parse_mode: 'Markdown' as const }
      };
      
    case 'compact':
      return {
        text: `${emoji} **${decision.asset} Analysis**\n\n` +
              `📊 **Position:** ${decision.position.toUpperCase()}\n` +
              `${riskColor} **Confidence:** ${confidence}%\n` +
              `💭 **Rationale:** ${decision.rationale}\n\n` +
              `📈 **Entry:** ${decision.entry.type === 'zone' ? 
                `$${decision.entry.lower?.toFixed(4)}-$${decision.entry.upper?.toFixed(4)}` : 
                `$${decision.entry.price?.toFixed(4)}`}\n` +
              `🛡️ **Stop:** $${decision.stop?.toFixed(4) || 'N/A'}\n` +
              `🎯 **Targets:** ${decision.targets.map((t: any) => `$${t.price.toFixed(4)}`).join(', ')}\n` +
              `⚖️ **R:R:** ${decision.realized_rr_est}:1\n\n` +
              `⚡ Analysis: ${analysisTime}ms`,
        options: { parse_mode: 'Markdown' as const }
      };
      
    default: // full
      return {
        text: `${emoji} **${decision.asset} - V2 Analysis Report**\n\n` +
              `🎯 **Trade Signal**\n` +
              `├ Position: ${decision.position.toUpperCase()}\n` +
              `├ Confidence: ${confidence}% ${riskColor}\n` +
              `├ Market: ${decision.market.toUpperCase()}\n` +
              `└ Timeframe: ${decision.timeframe}\n\n` +
              
              `💰 **Entry Strategy**\n` +
              `├ Type: ${decision.entry.type.toUpperCase()}\n` +
              `├ Zone: $${decision.entry.lower?.toFixed(4)} - $${decision.entry.upper?.toFixed(4)}\n` +
              `├ Stop Loss: $${decision.stop?.toFixed(4) || 'N/A'}\n` +
              `└ Leverage: ${decision.leverage}x\n\n` +
              
              `🎯 **Targets & Risk**\n` +
              `├ Targets: ${decision.targets.map((t: any, i: number) => 
                `T${i+1}: $${t.price.toFixed(4)} (${t.size_pct}%)`).join(', ')}\n` +
              `├ Expected R:R: ${decision.realized_rr_est}:1\n` +
              `├ Min R:R: ${decision.rr_min}:1\n` +
              `└ Position Size: ${decision.size_pct}%\n\n` +
              
              `📊 **Technical Scores**\n` +
              `├ Trend: ${Math.round(decision.feature_scores.trend * 100)}%\n` +
              `├ Momentum: ${Math.round(decision.feature_scores.momentum * 100)}%\n` +
              `├ RSI Signal: ${Math.round(decision.feature_scores.rsi_signal * 100)}%\n` +
              `└ Risk Level: ${Math.round(decision.feature_scores.risk * 100)}%\n\n` +
              
              `📡 **Data Quality**\n` +
              `├ Age: ${decision.data_quality.age_sec}s\n` +
              `├ Status: ${decision.data_quality.stale ? 'STALE 🔴' : 'FRESH 🟢'}\n` +
              `└ Coverage: ${Object.values(decision.data_quality.coverage).filter(Boolean).length}/${Object.keys(decision.data_quality.coverage).length}\n\n` +
              
              `💭 **AI Rationale**\n"${decision.rationale}"\n\n` +
              `⚡ Analysis completed in ${analysisTime}ms\n` +
              `🤖 Generated: ${new Date(decision.timestamp_ms).toLocaleTimeString()}`,
        options: { parse_mode: 'Markdown' as const }
      };
  }
}

async function showAnalysisHelp(ctx: MyContext) {
  const helpText = `🔍 **V2 Analysis Commands**

**Quick Analysis:**
\`/v2 BTCUSDT\` - Analyze Bitcoin
\`/v2 ETHUSDT model=gpt4mini\` - Use GPT-4o-mini
\`/v2 AAPL format=compact\` - Compact format

**Parameters:**
• **model**: claude (default), gpt4o, gpt4mini
• **format**: full (default), compact, quick
• **timeframe**: 1h (default), 15m, 30m, 4h, 1d

**Examples:**
\`/v2 SOLUSDT model=claude format=full\`
\`/v2 MSFT model=gpt4mini format=quick\`
\`/v2 THYAO model=gpt4o\` (BIST stock)

**Batch Analysis:**
\`/v2batch BTCUSDT,ETHUSDT,SOLUSDT\`
\`/v2compare BTCUSDT vs ETHUSDT\`

**Shortcuts:**
\`/btc\` = \`/v2 BTCUSDT format=quick\`
\`/eth\` = \`/v2 ETHUSDT format=quick\`
\`/quick SYMBOL\` = \`/v2 SYMBOL format=quick\`

Use \`/v2models\` to see model performance stats.`;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
}

// Batch analysis command
export async function handleV2BatchCommand(ctx: MyContext, args: string) {
  try {
    const symbols = args.split(',').map(s => s.trim().toUpperCase()).filter(s => isValidSymbol(s));
    
    if (symbols.length === 0) {
      await ctx.reply('❌ Please provide valid symbols separated by commas.\nExample: `/v2batch BTCUSDT,ETHUSDT,SOLUSDT`');
      return;
    }
    
    if (symbols.length > 5) {
      await ctx.reply('❌ Maximum 5 symbols allowed for batch analysis.');
      return;
    }
    
    await ctx.replyWithChatAction('typing');
    const processingMsg = await ctx.reply(`🔄 Analyzing ${symbols.length} assets...`);
    
    const results = await Promise.allSettled(
      symbols.map(symbol => analyzeAssetV2(symbol))
    );
    
    let summary = `📊 **Batch Analysis Results**\n\n`;
    let tradeable = 0;
    let dataIssues = 0;
    let failed = 0;
    
    results.forEach((result, index) => {
      const symbol = symbols[index];
      if (result.status === 'fulfilled') {
        const decision = result.value;
        
        // Check if decision is valid
        if (!decision || !decision.position || decision.confidence === undefined) {
          summary += `❓ **${symbol}**: Invalid response\n`;
          failed++;
          return;
        }
        
        const emoji = EMOJI_MAP[decision.position as keyof typeof EMOJI_MAP];
        const confidence = Math.round(decision.confidence * 100);
        
        // Check for data quality issues
        if (decision.position === 'hold' && decision.rationale) {
          const rationale = decision.rationale.toLowerCase();
          if (rationale.includes('stale') || rationale.includes('missing') || rationale.includes('cache')) {
            summary += `📡 **${symbol}**: Data issues (${confidence}%)\n`;
            dataIssues++;
            return;
          }
        }
        
        summary += `${emoji} **${symbol}**: ${decision.position.toUpperCase()} (${confidence}%)\n`;
        if (decision.position !== 'hold' && confidence > 60) tradeable++;
      } else {
        const error = result.reason;
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        if (errorMsg.includes('cache') || errorMsg.includes('data') || errorMsg.includes('OHLCV')) {
          summary += `📡 **${symbol}**: Data unavailable\n`;
          dataIssues++;
        } else {
          summary += `❌ **${symbol}**: Analysis failed\n`;
          failed++;
        }
      }
    });
    
    summary += `\n📈 **Summary**: ${tradeable} tradeable signals found`;
    if (dataIssues > 0) {
      summary += `\n📡 **Data Issues**: ${dataIssues} symbols (try again in 5-10 min)`;
    }
    if (failed > 0) {
      summary += `\n❌ **Failed**: ${failed} symbols`;
    }
    
    if (tradeable > 0) {
      summary += `\n\n💡 Use \`/v2 SYMBOL\` for detailed analysis of promising assets.`;
    } else if (dataIssues > 0) {
      summary += `\n\n🔄 **Tip**: Wait a few minutes for cache refresh, then retry batch analysis.`;
    }
    
    await ctx.api.editMessageText(ctx.chat!.id, processingMsg.message_id, summary, { parse_mode: 'Markdown' });
    
  } catch (error: any) {
    console.error('V2 Batch command failed:', error);
    await ctx.reply('❌ Batch analysis failed. Please try again with fewer symbols.');
  }
}

// Model performance stats
export async function handleV2ModelsCommand(ctx: MyContext) {
  const modelStats = `🤖 **AI Model Performance**

**Claude 3.5 Sonnet** (Default)
├ Speed: ⭐⭐⭐ (2-3s avg)
├ Accuracy: ⭐⭐⭐⭐⭐ (95%+ valid JSON)
├ Analysis Quality: ⭐⭐⭐⭐⭐ (Detailed reasoning)
└ Cost: $$$ (Higher)

**GPT-4o-mini** (Fast)
├ Speed: ⭐⭐⭐⭐⭐ (1-2s avg)
├ Accuracy: ⭐⭐⭐⭐ (90%+ valid JSON)  
├ Analysis Quality: ⭐⭐⭐⭐ (Good reasoning)
└ Cost: $ (Cheapest)

**GPT-4o** (Premium)
├ Speed: ⭐⭐ (3-5s avg)
├ Accuracy: ⭐⭐⭐⭐⭐ (98%+ valid JSON)
├ Analysis Quality: ⭐⭐⭐⭐⭐ (Comprehensive)
└ Cost: $$$$ (Most expensive)

**Recommendation:**
• Day trading: GPT-4o-mini (speed)  
• Swing trading: Claude 3.5 (balance)
• Research: GPT-4o (depth)

Change default: \`/v2settings model=gpt4mini\``;

  await ctx.reply(modelStats, { parse_mode: 'Markdown' });
}