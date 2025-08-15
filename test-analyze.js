// Test script to debug the analyze function
require('dotenv').config(); // Load environment variables
const { buildAnalysisRequest, askMultiAssetPlan } = require('./packages/ai/dist/orchestrator');

async function testAnalyze() {
  console.log('🧪 Testing expanded analyze function...');
  
  try {
    // Test with expanded default analysis (like /analyze command)
    const request = await buildAnalysisRequest({
      horizon: '1w',
      markets: ['crypto', 'spx'],
      symbols: [], // Empty = use expanded universe
      prefer: [],
      include_global: true,
      top: 3
    });
    
    console.log('✅ Analysis request built successfully');
    console.log('📊 Request data:', JSON.stringify(request, null, 2));
    
    const result = await askMultiAssetPlan(request);
    console.log('✅ AI analysis complete');
    console.log('🎯 Result:', JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAnalyze();