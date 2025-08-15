import { buildAnalysisRequest, askMultiAssetPlan } from '@trade/ai';

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
    
    // Use environment defaults for comprehensive analysis
    const defaultMarkets = (process.env.SCAN_DEFAULT_MARKETS || 'crypto,spx,bist').split(',');
    const defaultResultCount = parseInt(process.env.ANALYSIS_RESULT_COUNT || '3', 10);
    
    // Build analysis request
    const analysisRequest = await buildAnalysisRequest({
      horizon: params.horizon || '1w',
      markets: params.markets ? params.markets.split(',') : defaultMarkets,
      symbols: params.symbols ? params.symbols.split(',') : [],
      prefer: params.prefer ? params.prefer.split(',') : [],
      include_global: params.include_global !== 'false',
      top: parseInt(params.top || defaultResultCount.toString(), 10)
    });
    
    // Get AI analysis
    const result = await askMultiAssetPlan(analysisRequest);
    
    // Render response
    await renderAnalysisResponse(ctx, result, params);
    
  } catch (error) {
    console.error('Analyze command failed:', error);
    await ctx.reply('❌ Analysis failed. Please try again.');
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
  const defaultResultCount = parseInt(process.env.ANALYSIS_RESULT_COUNT || '3', 10);
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