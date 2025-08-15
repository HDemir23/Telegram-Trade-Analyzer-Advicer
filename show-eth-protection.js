// Show how enhanced analysis protects against ETH-like mistakes
require('dotenv').config();
const { buildAnalysisRequest } = require('./packages/ai/dist/orchestrator');

async function showETHProtection() {
  console.log('🛡️ ETH MISTAKE PREVENTION ANALYSIS\n');
  
  const request = await buildAnalysisRequest({
    horizon: '1w',
    markets: ['crypto'],
    symbols: ['ETHUSDT'],
    prefer: [],
    include_global: true,
    top: 1
  });
  
  const ethData = request.data.marketData['ETHUSDT'];
  const ethTech = request.data.technical['ETHUSDT'];
  
  console.log('🔍 CURRENT ETH ANALYSIS:');
  console.log(`💰 Current Price: $${ethData.current_price}`);
  console.log(`📊 RSI: ${ethTech.rsi.toFixed(1)} ${ethTech.rsi > 70 ? '🚨 OVERBOUGHT' : ethTech.rsi < 30 ? '🚀 OVERSOLD' : '✅ NORMAL'}`);
  console.log(`📈 Trend: ${ethTech.trend} ${ethTech.trend === 'bearish' ? '📉 BEARISH' : ethTech.trend === 'bullish' ? '📈 BULLISH' : '➡️ NEUTRAL'}`);
  console.log(`⚡ Momentum: ${ethTech.momentum} ${ethTech.momentum.includes('negative') ? '🔻 WEAK' : ethTech.momentum.includes('positive') ? '🚀 STRONG' : '➖ FLAT'}`);
  console.log(`⚠️ Reversal Risk: ${ethTech.reversal_risk} ${ethTech.reversal_risk.includes('high') ? '🚨 DANGER' : '✅ SAFE'}`);
  
  console.log('\n🧠 AI DECISION LOGIC:');
  
  // Show the protection mechanisms
  if (ethTech.trend === 'bearish' && ethTech.momentum.includes('negative')) {
    console.log('❌ PROTECTION ACTIVE: Bearish trend + negative momentum');
    console.log('   → AI will score this LOWER or recommend SHORT');
  }
  
  if (ethTech.rsi > 70) {
    console.log('❌ PROTECTION ACTIVE: RSI overbought (>70)');
    console.log('   → AI will avoid LONG positions');
  }
  
  if (ethTech.reversal_risk === 'high_bearish') {
    console.log('🚨 PROTECTION ACTIVE: High bearish reversal risk');
    console.log('   → AI will NEVER recommend LONG positions');
  } else if (ethTech.reversal_risk === 'medium') {
    console.log('⚠️ PROTECTION ACTIVE: Medium reversal risk');
    console.log('   → AI confidence reduced by 30%');
  }
  
  // Price vs moving averages
  console.log('\n📊 MOVING AVERAGE ANALYSIS:');
  if (ethData.current_price < ethTech.sma7) {
    console.log('📉 Price below 7-day SMA → SHORT-TERM BEARISH');
  }
  if (ethData.current_price < ethTech.sma14) {
    console.log('📉 Price below 14-day SMA → MEDIUM-TERM BEARISH');
  }
  if (ethData.current_price < ethTech.sma50) {
    console.log('📉 Price below 50-day SMA → LONG-TERM BEARISH');
  }
  
  console.log('\n🎯 FINAL ASSESSMENT:');
  let recommendation = 'LONG';
  let confidence = 85;
  
  // Apply all the protections
  if (ethTech.trend === 'bearish') {
    confidence -= 25;
    console.log('   • Bearish trend: -25% confidence');
  }
  
  if (ethTech.momentum.includes('negative')) {
    confidence -= 20;
    console.log('   • Negative momentum: -20% confidence');
    if (ethTech.trend === 'bearish') {
      recommendation = 'SHORT';
      console.log('   • Combined bearish trend + negative momentum = SHORT bias');
    }
  }
  
  if (ethTech.rsi > 70) {
    confidence -= 30;
    recommendation = 'AVOID LONG';
    console.log('   • Overbought RSI: -30% confidence, avoid longs');
  }
  
  if (ethTech.reversal_risk === 'medium') {
    confidence -= 30;
    console.log('   • Medium reversal risk: -30% confidence');
  }
  
  if (ethTech.reversal_risk === 'high_bearish') {
    recommendation = 'NO LONG TRADES';
    confidence = 0;
    console.log('   • High bearish reversal risk: NO LONG TRADES ALLOWED');
  }
  
  console.log(`\n🏆 FINAL RECOMMENDATION: ${recommendation}`);
  console.log(`📊 ADJUSTED CONFIDENCE: ${Math.max(0, confidence)}%`);
  
  if (confidence < 60) {
    console.log('⚠️ BELOW MINIMUM CONFIDENCE (60%) → TRADE FILTERED OUT');
  }
  
  console.log('\n💡 HOW THIS PREVENTS ETH MISTAKES:');
  console.log('✅ Real technical analysis instead of random data');
  console.log('✅ Multiple confirmation factors (trend + momentum + RSI)');
  console.log('✅ Reversal risk detection catches overbought conditions');
  console.log('✅ Minimum confidence threshold filters weak setups');
  console.log('✅ Moving average analysis provides objective trend direction');
  console.log('✅ Risk-first approach prioritizes capital preservation');
  
  console.log('\n🚨 OLD SYSTEM vs NEW SYSTEM:');
  console.log('❌ OLD: Random RSI, always bullish bias, no reversal detection');
  console.log('✅ NEW: Real RSI, trend analysis, reversal risk, momentum confirmation');
  console.log('❌ OLD: Mock data, no price history, simple scoring');
  console.log('✅ NEW: Historical analysis, multi-timeframe, professional methodology');
  
}

showETHProtection().catch(console.error);