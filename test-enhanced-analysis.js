// Test enhanced technical analysis with reversal detection
require('dotenv').config();
const { buildAnalysisRequest, askMultiAssetPlan } = require('./packages/ai/dist/orchestrator');

async function testEnhancedAnalysis() {
  console.log('🔬 Testing ENHANCED Technical Analysis with Reversal Detection...\n');
  
  try {
    // Focus on ETH and other assets that had issues
    const request = await buildAnalysisRequest({
      horizon: '1w',
      markets: ['crypto', 'spx'],
      symbols: ['ETHUSDT', 'BTCUSDT', 'AAPL', 'MSFT'], // Include ETH specifically
      prefer: [],
      include_global: true,
      top: 4
    });
    
    console.log('📊 Technical Analysis Results:');
    for (const [symbol, technical] of Object.entries(request.data.technical)) {
      console.log(`\n${symbol}:`);
      console.log(`  🎯 RSI: ${technical.rsi?.toFixed(1)} | Trend: ${technical.trend} | Momentum: ${technical.momentum}`);
      console.log(`  ⚠️  Reversal Risk: ${technical.reversal_risk} | Volatility: ${technical.volatility?.toFixed(1)}%`);
      console.log(`  📈 Support: $${technical.support_level?.toFixed(2)} | Resistance: $${technical.resistance_level?.toFixed(2)}`);
      
      // Risk assessment
      if (technical.reversal_risk === 'high_bearish') {
        console.log('  🚨 HIGH BEARISH REVERSAL RISK - AVOID LONGS!');
      } else if (technical.reversal_risk === 'high_bullish') {
        console.log('  🚀 HIGH BULLISH REVERSAL POTENTIAL - AVOID SHORTS!');
      } else if (technical.reversal_risk === 'medium') {
        console.log('  ⚠️  MEDIUM REVERSAL RISK - REDUCE POSITION SIZE');
      }
    }
    
    console.log('\n🤖 Enhanced AI Analysis with Reversal Detection...');
    const result = await askMultiAssetPlan(request);
    
    console.log('\n🏆 AI RECOMMENDATIONS WITH RISK ASSESSMENT:');
    result.ranking.forEach((item, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
      const plan = result.plans[item.symbol];
      const technical = request.data.technical[item.symbol];
      
      console.log(`\n${medal} ${item.symbol.toUpperCase()} - Score: ${(item.score * 100).toFixed(0)}%`);
      console.log(`   💡 ${item.reason}`);
      console.log(`   ⚠️  Reversal Risk: ${technical?.reversal_risk || 'unknown'} | RSI: ${technical?.rsi?.toFixed(1) || 'N/A'}`);
      
      if (plan) {
        console.log(`   📈 Strategy: ${plan.position.toUpperCase()}`);
        console.log(`   💰 Entry: $${plan.entry.price.toFixed(2)}`);
        console.log(`   🛡️ Stop: $${plan.stop_loss.toFixed(2)}`);
        console.log(`   🎯 Target: $${plan.take_profits[0].price.toFixed(2)}`);
        
        // Validate recommendation against reversal risk
        if (plan.position === 'long' && technical?.reversal_risk === 'high_bearish') {
          console.log('   ❌ WARNING: AI recommended LONG despite HIGH BEARISH REVERSAL RISK!');
        } else if (plan.position === 'short' && technical?.reversal_risk === 'high_bullish') {
          console.log('   ❌ WARNING: AI recommended SHORT despite HIGH BULLISH REVERSAL RISK!');
        } else {
          console.log('   ✅ Recommendation aligns with reversal risk assessment');
        }
      }
    });
    
    // Check if ETH analysis improved
    const ethAnalysis = result.ranking.find(r => r.symbol === 'ETHUSDT');
    if (ethAnalysis) {
      console.log('\n🔍 ETH ANALYSIS IMPROVEMENT:');
      const ethTechnical = request.data.technical['ETHUSDT'];
      console.log(`  Current ETH Score: ${(ethAnalysis.score * 100).toFixed(0)}%`);
      console.log(`  Reversal Risk: ${ethTechnical?.reversal_risk}`);
      console.log(`  RSI: ${ethTechnical?.rsi?.toFixed(1)}`);
      console.log(`  Trend: ${ethTechnical?.trend}`);
      console.log(`  Momentum: ${ethTechnical?.momentum}`);
      
      if (ethTechnical?.reversal_risk === 'high_bearish' || ethTechnical?.momentum === 'strong_negative') {
        console.log('  ✅ Enhanced analysis would have detected ETH reversal risk!');
      } else {
        console.log('  ⚠️  Current conditions may still be favorable for ETH');
      }
    }
    
    console.log('\n✅ Enhanced technical analysis with reversal detection complete!');
    
  } catch (error) {
    console.error('❌ Enhanced analysis test failed:', error);
  }
}

testEnhancedAnalysis();