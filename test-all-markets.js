// Comprehensive test for ALL market data sources
require('dotenv').config();
const { buildAnalysisRequest, askMultiAssetPlan } = require('./packages/ai/dist/orchestrator');

async function testAllMarkets() {
  console.log('🧪 Testing ALL market data sources...\n');
  
  try {
    // Test each market separately first
    console.log('📊 Testing CRYPTO data sources...');
    await testCrypto();
    
    console.log('\n📊 Testing SPX data sources...');
    await testSPX();
    
    console.log('\n📊 Testing BIST data sources...');
    await testBIST();
    
    console.log('\n🔥 Testing COMPLETE analysis with all markets...');
    await testCompleteAnalysis();
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

async function testCrypto() {
  const cryptoSymbols = ['BTCUSDT', 'ETHUSDT', 'LINKUSDT', 'SUIUSDT', 'BNBUSDT'];
  
  const request = await buildAnalysisRequest({
    horizon: '1w',
    markets: ['crypto'],
    symbols: cryptoSymbols,
    prefer: [],
    include_global: true,
    top: 3
  });
  
  console.log('✅ Crypto data collected:');
  for (const [symbol, data] of Object.entries(request.data.marketData)) {
    const quality = data.data_quality || 'real';
    console.log(`  💰 ${symbol}: $${data.current_price} (${quality})`);
  }
}

async function testSPX() {
  const spxSymbols = ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA'];
  
  const request = await buildAnalysisRequest({
    horizon: '1w',
    markets: ['spx'],
    symbols: spxSymbols,
    prefer: [],
    include_global: true,
    top: 3
  });
  
  console.log('✅ SPX data collected:');
  for (const [symbol, data] of Object.entries(request.data.marketData)) {
    const quality = data.data_quality || 'real';
    console.log(`  💰 ${symbol}: $${data.current_price} (${quality})`);
  }
}

async function testBIST() {
  const bistSymbols = ['THYAO', 'AKBNK'];
  
  const request = await buildAnalysisRequest({
    horizon: '1w',
    markets: ['bist'],
    symbols: bistSymbols,
    prefer: [],
    include_global: true,
    top: 2
  });
  
  console.log('✅ BIST data collected:');
  for (const [symbol, data] of Object.entries(request.data.marketData)) {
    const quality = data.data_quality || 'real';
    console.log(`  💰 ${symbol}: $${data.current_price} (${quality})`);
  }
}

async function testCompleteAnalysis() {
  const request = await buildAnalysisRequest({
    horizon: '1w',
    markets: ['crypto', 'spx', 'bist'],
    symbols: [], // Let it choose from all markets
    prefer: [],
    include_global: true,
    top: 3
  });
  
  console.log(`✅ Complete analysis: ${Object.keys(request.data.marketData).length} assets analyzed`);
  
  // Get AI recommendations
  const result = await askMultiAssetPlan(request);
  console.log('\n🏆 AI Top Recommendations:');
  result.ranking.forEach((item, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉';
    console.log(`  ${medal} ${item.symbol} (${item.market}): ${(item.score * 100).toFixed(0)}% - ${item.reason}`);
  });
  
  // Check data quality summary
  let realDataCount = 0;
  let fallbackCount = 0;
  
  for (const [symbol, data] of Object.entries(request.data.marketData)) {
    if (data.data_quality === 'fallback') {
      fallbackCount++;
    } else {
      realDataCount++;
    }
  }
  
  console.log(`\n📈 Data Quality Summary:`);
  console.log(`  ✅ Real-time data: ${realDataCount} assets`);
  console.log(`  ⚠️  Fallback data: ${fallbackCount} assets`);
  console.log(`  📊 Success rate: ${((realDataCount / (realDataCount + fallbackCount)) * 100).toFixed(1)}%`);
}

testAllMarkets();