// Modern Telegram UI Components with Comprehensive Button Layouts

import { InlineKeyboard } from 'grammy';
import { AI_MODELS, ModelSelector } from '@trade/ai';

export class TradingKeyboards {
  // Main menu keyboard
  static mainMenu() {
    return new InlineKeyboard()
      .text('🔥 Quick Analysis', 'menu_quick').text('🎯 Portfolio Funnel', 'menu_portfolio').row()
      .text('🔍 Screening', 'menu_screening').text('📊 Compare Assets', 'menu_compare').row()
      .text('⚙️ Settings', 'menu_settings').text('🤖 AI Models', 'menu_models').row()
      .text('📚 Help', 'menu_help').text('🐛 Debug', 'menu_debug');
  }

  // Quick analysis symbols
  static quickSymbols() {
    return new InlineKeyboard()
      .text('🟠 Bitcoin', 'quick_BTCUSDT').text('💎 Ethereum', 'quick_ETHUSDT').row()
      .text('🌞 Solana', 'quick_SOLUSDT').text('🔗 Chainlink', 'quick_LINKUSDT').row()
      .text('🍎 Apple', 'quick_AAPL').text('🪟 Microsoft', 'quick_MSFT').row()
      .text('⚡ Tesla', 'quick_TSLA').text('🎯 Nvidia', 'quick_NVDA').row()
      .text('◀️ Back', 'menu_main');
  }

  // Screening categories
  static screeningMenu() {
    return new InlineKeyboard()
      .text('🚀 Crypto Screening', 'screen_crypto').row()
      .text('📈 Stock Screening', 'screen_stocks').row()
      .text('🌍 Full Universe', 'screen_all').row()
      .text('◀️ Back', 'menu_main');
  }

  // Portfolio options
  static portfolioMenu() {
    return new InlineKeyboard()
      .text('💼 Full Portfolio Analysis', 'portfolio_full').row()
      .text('⚡ Quick Portfolio (5min)', 'portfolio_quick').row()
      .text('🎯 Conservative Portfolio', 'portfolio_conservative').row()
      .text('🔥 Aggressive Portfolio', 'portfolio_aggressive').row()
      .text('◀️ Back', 'menu_main');
  }

  // AI Model selection
  static modelSelection(currentModel?: string) {
    const keyboard = new InlineKeyboard();
    
    // Group models by provider
    const models = ModelSelector.getAllModels();
    const openAI = models.filter(m => m.provider === 'OpenAI');
    const anthropic = models.filter(m => m.provider === 'Anthropic');
    const meta = models.filter(m => m.provider === 'Meta');

    // OpenAI models
    keyboard.text('🤖 OpenAI Models', 'models_header_openai').row();
    openAI.forEach(model => {
      const isSelected = currentModel === model.id ? '✅ ' : '';
      const speedEmoji = model.speed === 'very_fast' ? '⚡' : model.speed === 'fast' ? '🚀' : '🐌';
      keyboard.text(`${isSelected}${speedEmoji} ${model.name}`, `model_select_${model.id}`).row();
    });

    // Anthropic models
    keyboard.text('🧠 Anthropic Models', 'models_header_anthropic').row();
    anthropic.forEach(model => {
      const isSelected = currentModel === model.id ? '✅ ' : '';
      keyboard.text(`${isSelected}🧠 ${model.name}`, `model_select_${model.id}`).row();
    });

    // Meta models
    if (meta.length > 0) {
      keyboard.text('🦙 Meta Models', 'models_header_meta').row();
      meta.forEach(model => {
        const isSelected = currentModel === model.id ? '✅ ' : '';
        keyboard.text(`${isSelected}🦙 ${model.name}`, `model_select_${model.id}`).row();
      });
    }

    keyboard.text('◀️ Back', 'menu_main');
    return keyboard;
  }

  // Settings menu
  static settingsMenu(currentSettings: any) {
    return new InlineKeyboard()
      .text('🤖 Change AI Model', 'settings_model').text('📊 Output Format', 'settings_format').row()
      .text('🎯 Confidence Threshold', 'settings_threshold').text('⚡ Analysis Speed', 'settings_speed').row()
      .text('🔔 Notifications', 'settings_notifications').text('🌙 Dark Mode', 'settings_theme').row()
      .text('📋 Presets', 'settings_presets').text('🔄 Reset All', 'settings_reset').row()
      .text('◀️ Back', 'menu_main');
  }

  // Debug menu
  static debugMenu() {
    return new InlineKeyboard()
      .text('📊 Performance Stats', 'debug_performance').text('🔍 Recent Logs', 'debug_logs').row()
      .text('❌ Error Report', 'debug_errors').text('🧪 Test Mode', 'debug_test').row()
      .text('📈 Usage Analytics', 'debug_analytics').text('🛠️ System Status', 'debug_status').row()
      .text('🗑️ Clear Logs', 'debug_clear').text('📝 Export Debug', 'debug_export').row()
      .text('◀️ Back', 'menu_main');
  }

  // Analysis result actions
  static analysisActions(symbol: string, hasFullAnalysis = false) {
    const keyboard = new InlineKeyboard()
      .text('🔄 Refresh', `refresh_${symbol}`);
    
    if (!hasFullAnalysis) {
      keyboard.text('📊 Full Analysis', `full_${symbol}`);
    }
    
    keyboard.row()
      .text('📈 Add to Watchlist', `watch_${symbol}`)
      .text('🔔 Set Alert', `alert_${symbol}`)
      .row()
      .text('📱 Share', `share_${symbol}`)
      .text('💾 Save', `save_${symbol}`)
      .row()
      .text('◀️ Back', 'menu_main');
    
    return keyboard;
  }

  // Portfolio result actions
  static portfolioActions() {
    return new InlineKeyboard()
      .text('🔄 Refresh Portfolio', 'portfolio_refresh').text('📊 Detailed View', 'portfolio_details').row()
      .text('💾 Save Portfolio', 'portfolio_save').text('📱 Share Portfolio', 'portfolio_share').row()
      .text('⚙️ Adjust Allocation', 'portfolio_adjust').text('🎯 Risk Analysis', 'portfolio_risk').row()
      .text('◀️ Back', 'menu_main');
  }

  // Format selection
  static formatSelection(currentFormat: string) {
    return new InlineKeyboard()
      .text(currentFormat === 'quick' ? '✅ Quick' : 'Quick', 'format_quick').row()
      .text(currentFormat === 'compact' ? '✅ Compact' : 'Compact', 'format_compact').row()
      .text(currentFormat === 'full' ? '✅ Full' : 'Full', 'format_full').row()
      .text('◀️ Back', 'settings_main');
  }

  // Preset configurations
  static presetSelection() {
    return new InlineKeyboard()
      .text('🏃 Day Trader', 'preset_daytrader').text('💎 Long-term Investor', 'preset_investor').row()
      .text('🎯 Conservative', 'preset_conservative').text('🔥 Aggressive', 'preset_aggressive').row()
      .text('⚖️ Balanced', 'preset_balanced').text('🧪 Research Mode', 'preset_research').row()
      .text('◀️ Back', 'settings_main');
  }

  // Confirmation dialogs
  static confirmAction(action: string, symbol?: string) {
    return new InlineKeyboard()
      .text('✅ Confirm', `confirm_${action}_${symbol || 'global'}`)
      .text('❌ Cancel', 'cancel_action')
      .row();
  }

  // Help categories
  static helpMenu() {
    return new InlineKeyboard()
      .text('🚀 Getting Started', 'help_quickstart').text('📊 Analysis Guide', 'help_analysis').row()
      .text('💼 Portfolio Guide', 'help_portfolio').text('🔍 Screening Guide', 'help_screening').row()
      .text('🤖 AI Models Guide', 'help_models').text('⚙️ Settings Guide', 'help_settings').row()
      .text('🐛 Troubleshooting', 'help_troubleshooting').text('❓ FAQ', 'help_faq').row()
      .text('◀️ Back', 'menu_main');
  }

  // Symbol input helper
  static symbolInput() {
    return new InlineKeyboard()
      .text('Popular Crypto', 'symbols_crypto').text('Popular Stocks', 'symbols_stocks').row()
      .text('Forex Pairs', 'symbols_forex').text('Commodities', 'symbols_commodities').row()
      .text('◀️ Cancel', 'menu_main');
  }

  // Timeframe selection
  static timeframeSelection() {
    return new InlineKeyboard()
      .text('15m', 'timeframe_15m').text('30m', 'timeframe_30m').text('1h', 'timeframe_1h').row()
      .text('4h', 'timeframe_4h').text('1d', 'timeframe_1d').row()
      .text('◀️ Back', 'menu_main');
  }

  // Custom symbol groups
  static cryptoSymbols() {
    return new InlineKeyboard()
      .text('🟠 BTC', 'quick_BTCUSDT').text('💎 ETH', 'quick_ETHUSDT').text('🌞 SOL', 'quick_SOLUSDT').row()
      .text('🔗 LINK', 'quick_LINKUSDT').text('🌊 ADA', 'quick_ADAUSDT').text('🔺 AVAX', 'quick_AVAXUSDT').row()
      .text('🔮 DOT', 'quick_DOTUSDT').text('🦄 UNI', 'quick_UNIUSDT').text('🌌 ATOM', 'quick_ATOMUSDT').row()
      .text('◀️ Back', 'symbols_menu');
  }

  static stockSymbols() {
    return new InlineKeyboard()
      .text('🍎 AAPL', 'quick_AAPL').text('🪟 MSFT', 'quick_MSFT').text('🔍 GOOGL', 'quick_GOOGL').row()
      .text('📦 AMZN', 'quick_AMZN').text('🎯 NVDA', 'quick_NVDA').text('⚡ TSLA', 'quick_TSLA').row()
      .text('📘 META', 'quick_META').text('🎬 NFLX', 'quick_NFLX').text('🏦 JPM', 'quick_JPM').row()
      .text('◀️ Back', 'symbols_menu');
  }
}