#!/usr/bin/env node

// Bot V3 Startup Script
import { tradingBot } from './core/trading-bot';

async function startBotV3() {
  console.log('🚀 Starting AI Trading Bot V3...');
  
  try {
    // Initialize market data cache first
    console.log('📦 Initializing market data cache...');
    const { marketDataCache } = await import('@trade/ai');
    await marketDataCache.init();
    await marketDataCache.preloadAllSymbols();
    console.log('✅ Market data cache ready');
    
    // Start the bot
    await tradingBot.start();
    console.log('✅ AI Trading Bot V3 started successfully!');
    
    // Graceful shutdown handlers
    const shutdown = async () => {
      console.log('🔄 Shutting down Bot V3...');
      try {
        await tradingBot.stop();
        console.log('✅ Bot V3 shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    
  } catch (error) {
    console.error('❌ Failed to start Bot V3:', error);
    process.exit(1);
  }
}

// Start the bot
startBotV3();