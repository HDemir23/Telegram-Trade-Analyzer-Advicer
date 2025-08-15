// Test the robust AI analysis handler
require('dotenv').config();
const { buildAnalysisRequest, askMultiAssetPlan } = require('./packages/ai/dist/orchestrator');

async function testRobustAnalysis() {
  console.log('🧪 Testing robust AI analysis handler...\n');
  
  try {
    // Test with mixed markets to ensure balanced analysis
    const request = await buildAnalysisRequest({
      horizon: '1w',
      markets: ['crypto', 'spx', 'bist'],
      symbols: [], // Let it analyze all markets
      prefer: [],
      include_global: true,
      top: 3
    });
    
    console.log(`📊 Built analysis request with ${Object.keys(request.data.marketData).length} assets`);
    console.log('🎯 Top assets by data quality:');
    
    Object.entries(request.data.marketData).slice(0, 5).forEach(([symbol, data]) => {
      const hasTech = !!request.data.technical[symbol];
      const hasSentiment = !!request.data.sentiment[symbol];
      console.log(`  ${data.market === 'crypto' ? '🪙' : '📈'} ${symbol}: $${data.current_price} [Tech:${hasTech ? '✅' : '❌'} Sentiment:${hasSentiment ? '✅' : '❌'}]`);
    });
    
    console.log('\n🤖 Running AI analysis with robust error handling...');
    const result = await askMultiAssetPlan(request);
    
    console.log('\n🏆 ANALYSIS COMPLETE! Top Investment Opportunities:');
    result.ranking.forEach((item, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
      const plan = result.plans[item.symbol];
      
      console.log(`\n${medal} ${item.symbol.toUpperCase()} (${item.market.toUpperCase()}) - Score: ${(item.score * 100).toFixed(0)}%`);
      console.log(`   💡 ${item.reason}`);
      
      if (plan) {
        console.log(`   📈 Strategy: ${plan.position.toUpperCase()} position`);
        console.log(`   💰 Entry: $${plan.entry.price.toFixed(2)} (Zone: $${plan.entry.zone[0].toFixed(2)}-$${plan.entry.zone[1].toFixed(2)})`);
        console.log(`   🛡️ Stop Loss: $${plan.stop_loss.toFixed(2)} (${plan.position === 'short' ? '+' : '-'}${(((plan.stop_loss / plan.entry.price - 1) * 100)).toFixed(1)}%)`);
        console.log(`   🎯 Take Profit: $${plan.take_profits[0].price.toFixed(2)} & $${plan.take_profits[1].price.toFixed(2)}`);
        console.log(`   ⚡ Expected R:R: ${plan.expected_rr}:1`);
        console.log(`   📊 RSI: ${plan.indicator_snapshot.rsi.toFixed(1)}, Trend: ${plan.rationale.trend}`);
      }
    });
    
    console.log('\n📋 MARKET ANALYSIS SUMMARY:');
    const cryptoCount = result.ranking.filter(r => r.market === 'crypto').length;
    const stockCount = result.ranking.filter(r => r.market !== 'crypto').length;
    
    console.log(`  🪙 Crypto recommendations: ${cryptoCount}`);
    console.log(`  📈 Stock recommendations: ${stockCount}`);
    console.log(`  🎯 Analysis shows ${cryptoCount > stockCount ? 'crypto dominance' : stockCount > cryptoCount ? 'stock strength' : 'balanced markets'}`);
    
    console.log('\n✅ Robust analysis handler working perfectly!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testRobustAnalysis();