import { buildAnalysisRequest, askMultiAssetPlan } from '@trade/ai';
import { botConfig } from '../config';

interface AnalyzeArgs {
  horizon?: string;
  markets?: string;
  symbols?: string;
  prefer?: string;
  include_global?: string;
  top?: string;
}

export async function handleAnalyzeCommand(ctx: any, args: string) {
  try {
    const params = parseAnalyzeArgs(args);
    
    // Use centralized config defaults for comprehensive analysis
    const defaultMarkets = botConfig.SCAN_DEFAULT_MARKETS;
    const defaultResultCount = botConfig.ANALYSIS_RESULT_COUNT;
    
    // Check if market data cache is available
    const { marketDataCache } = await import('@trade/ai');
    if (!marketDataCache) {
      await ctx.reply('❌ Market data system is not available. Please try again later.');
      return;
    }

    // Build analysis request
    const analysisRequest = await buildAnalysisRequest({
      horizon: params.horizon || '1w',
      markets: params.markets ? params.markets.split(',') : defaultMarkets,
      symbols: params.symbols ? params.symbols.split(',') : [],
      prefer: params.prefer ? params.prefer.split(',') : [],
      include_global: params.include_global !== 'false',
      top: parseInt(params.top || defaultResultCount.toString(), 10)
    });
    
    // Check if analysis request is valid (not empty stub)
    if (!analysisRequest || Object.keys(analysisRequest).length === 0) {
      await ctx.reply('❌ Multi-asset analysis is currently unavailable. Try using `/v2 SYMBOL` for individual asset analysis instead.\n\nExample: `/v2 BTCUSDT` or `/v2 AAPL`');
      return;
    }

    // Get AI analysis
    const result = await askMultiAssetPlan(analysisRequest);
    
    // Check if result is valid (not empty stub)
    if (!result || Object.keys(result).length === 0 || !(result as any).ranking || !(result as any).plans) {
      await ctx.reply('❌ Multi-asset analysis returned no results. The system may be experiencing issues.\n\n💡 Try individual analysis: `/v2 BTCUSDT` or `/v2 AAPL`');
      return;
    }

    // Check if we have any valid rankings
    if (!Array.isArray((result as any).ranking) || (result as any).ranking.length === 0) {
      await ctx.reply('📊 No trading opportunities found in current market conditions.\n\n💡 Try specific symbols: `/v2 BTCUSDT` or `/v2 AAPL`');
      return;
    }
    
    // Render response
    await renderAnalysisResponse(ctx, result, params);
    
  } catch (error) {
    console.error('Analyze command failed:', error);
    
    // Provide more specific error messages
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('cache') || errorMsg.includes('OHLCV') || errorMsg.includes('data')) {
      await ctx.reply('❌ Market data is currently unavailable. Please try again in a few minutes.\n\n💡 Alternative: Use `/v2 SYMBOL` for individual analysis.');
    } else if (errorMsg.includes('AI') || errorMsg.includes('model')) {
      await ctx.reply('❌ AI analysis service is temporarily unavailable. Please try again later.');
    } else {
      await ctx.reply('❌ Analysis failed. Please try again or use `/v2 SYMBOL` for individual asset analysis.');
    }
  }
}

function parseAnalyzeArgs(args: string): AnalyzeArgs {
  const params: AnalyzeArgs = {};
  const pairs = args.split(' ');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      params[key as keyof AnalyzeArgs] = value;
    }
  }
  
  return params;
}

async function renderAnalysisResponse(ctx: any, result: any, params: any) {
  const defaultResultCount = botConfig.ANALYSIS_RESULT_COUNT;
  const topCount = parseInt(params.top || defaultResultCount.toString(), 10);
  
  // Card 1: Analysis summary and top rankings
  let rankingText = `🔍 *AI Market Analysis* - ${params.horizon || '1w'}\n`;
  rankingText += `📊 Analyzed ${result.ranking.length} assets across markets\n\n`;
  rankingText += `🏆 *Top ${Math.min(topCount, result.ranking.length)} Opportunities:*\n\n`;
  
  for (const [index, item] of result.ranking.slice(0, topCount).entries()) {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🎯';
    rankingText += `${medal} *${item.symbol}* (${item.market})\n`;
    rankingText += `   Score: ${(item.score * 100).toFixed(0)}% confidence\n`;
    if (item.reason) {
      rankingText += `   ${item.reason}\n`;
    }
    rankingText += `\n`;
  }
  
  await ctx.reply(rankingText, { parse_mode: 'Markdown' });
  
  // Card 2+: Individual plans
  for (const symbol of Object.keys(result.plans).slice(0, 3)) {
    const plan = result.plans[symbol];
    
    let planText = `📈 *${plan.symbol} Plan*\n\n`;
    planText += `🎯 *Position:* ${plan.position.toUpperCase()}\n`;
    planText += `💰 *Entry:* ${plan.entry.price} (${plan.entry.type})\n`;
    planText += `🛡️ *Stop Loss:* ${plan.stop_loss}\n`;
    planText += `🎯 *Take Profit:* ${plan.take_profits[0]?.price || 'N/A'}\n`;
    planText += `⚖️ *Risk/Reward:* ${plan.expected_rr}x\n`;
    planText += `🎯 *Confidence:* ${(plan.confidence * 100).toFixed(0)}%\n`;
    planText += `⏰ *Timeframe:* ${plan.timeframe}\n\n`;
    planText += `*Key Levels:*\n`;
    planText += `📈 Resistance: ${plan.key_levels.resistances.slice(0, 2).join(', ')}\n`;
    planText += `📉 Support: ${plan.key_levels.supports.slice(0, 2).join(', ')}\n`;
    
    const keyboard = {
      inline_keyboard: [[
        { text: '📊 Make Position', callback_data: `position_${symbol}_${plan.entry.price}_${plan.stop_loss}` }
      ]]
    };
    
    await ctx.reply(planText, { 
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  }
}