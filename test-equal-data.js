// Test equal data quality for all asset types
require('dotenv').config();
const { buildAnalysisRequest } = require('./packages/ai/dist/orchestrator');

async function testEqualDataQuality() {
  console.log('🧪 Testing EQUAL data quality across all asset types...\n');
  
  try {
    // Test mixed asset types to verify equal treatment
    const request = await buildAnalysisRequest({
      horizon: '1w',
      markets: ['crypto', 'spx', 'bist'],
      symbols: ['BTCUSDT', 'AAPL', 'THYAO'], // One from each market
      prefer: [],
      include_global: true,
      top: 3
    });
    
    console.log('📊 Data Quality Analysis:\n');
    
    for (const [symbol, data] of Object.entries(request.data.marketData)) {
      const market = data.market;
      const hasPrice = !!data.current_price;
      const hasTechnical = !!request.data.technical[symbol];
      const hasSentiment = !!request.data.sentiment[symbol];
      
      console.log(`${market === 'crypto' ? '🪙' : '📈'} ${symbol} (${market.toUpperCase()}):`)
      console.log(`  💰 Price: ${hasPrice ? '✅' : '❌'} ($${data.current_price})`)
      console.log(`  📊 Technical: ${hasTechnical ? '✅' : '❌'} ${hasTechnical ? `(RSI: ${request.data.technical[symbol]?.rsi?.toFixed(1)}, Trend: ${request.data.technical[symbol]?.trend})` : ''}`)
      console.log(`  💭 Sentiment/Fundamentals: ${hasSentiment ? '✅' : '❌'} ${hasSentiment ? (market === 'crypto' ? '(sentiment)' : '(fundamentals)') : ''}`)
      console.log('');
    }
    
    // Data quality summary
    const symbols = Object.keys(request.data.marketData);
    const allHavePrice = symbols.every(s => !!request.data.marketData[s].current_price);
    const allHaveTechnical = symbols.every(s => !!request.data.technical[s]);
    const allHaveSentiment = symbols.every(s => !!request.data.sentiment[s]);
    
    console.log('📋 EQUAL DATA QUALITY REPORT:')
    console.log(`  ✅ All assets have price data: ${allHavePrice}`)
    console.log(`  ✅ All assets have technical indicators: ${allHaveTechnical}`)
    console.log(`  ✅ All assets have sentiment/fundamentals: ${allHaveSentiment}`)
    console.log(`  🎯 Data equality achieved: ${allHavePrice && allHaveTechnical && allHaveSentiment}`)
    
    if (allHavePrice && allHaveTechnical && allHaveSentiment) {
      console.log('\n🎉 SUCCESS: AI bias eliminated - all asset types now have equal data quality!')
    } else {
      console.log('\n⚠️  WARNING: Data quality still unequal between asset types')
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testEqualDataQuality();