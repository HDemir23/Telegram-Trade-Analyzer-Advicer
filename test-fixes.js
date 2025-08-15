// Test the API fixes
require('dotenv').config();
const { buildAnalysisRequest, askMultiAssetPlan } = require('./packages/ai/dist/orchestrator');

async function testFixes() {
  console.log('🧪 Testing API fixes with limited scope...');
  
  try {
    // Test with fewer symbols to avoid rate limits
    const request = await buildAnalysisRequest({
      horizon: '1w',
      markets: ['crypto'], // Only crypto to test CoinGecko fixes
      symbols: ['BTCUSDT', 'LINKUSDT', 'SUIUSDT'], // Include previously failing ones
      prefer: [],
      include_global: true,
      top: 3
    });
    
    console.log('✅ Analysis request built successfully');
    console.log('📊 Market data collected for:', Object.keys(request.data.marketData));
    
    // Check if we got real data vs fallback
    for (const [symbol, data] of Object.entries(request.data.marketData)) {
      console.log(`💰 ${symbol}: $${data.current_price} ${data.data_quality || 'real'}`);
    }
    
    console.log('\n🤖 Testing AI analysis...');
    const result = await askMultiAssetPlan(request);
    console.log('✅ AI analysis complete');
    console.log('🏆 Top recommendations:');
    result.ranking.forEach((item, i) => {
      console.log(`  ${i+1}. ${item.symbol}: ${(item.score * 100).toFixed(0)}% - ${item.reason}`);
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testFixes();