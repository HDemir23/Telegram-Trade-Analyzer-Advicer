// Universe Configuration Manager
// Reads token universes from environment variables

export interface UniverseConfig {
  crypto: string[];
  spx: string[];
  bist: string[];
  all: string[];
}

export class UniverseManager {
  private config: UniverseConfig;

  constructor() {
    this.config = this.loadUniverses();
  }

  private loadUniverses(): UniverseConfig {
    // Load from environment variables
    const crypto = (process.env.UNIVERSE_CRYPTO || '').split(',').filter(s => s.trim());
    const spx = (process.env.UNIVERSE_SPX || '').split(',').filter(s => s.trim());
    const bist = (process.env.UNIVERSE_BIST || '').split(',').filter(s => s.trim());

    // Fallback universes if env vars not set
    const fallbackCrypto = [
      'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT',
      'AVAXUSDT', 'MATICUSDT', 'ATOMUSDT', 'NEARUSDT'
    ];
    
    const fallbackSpx = [
      'AAPL', 'MSFT', 'GOOGL', 'TSLA', 'NVDA', 'AMZN', 'META', 'NFLX',
      'AMD', 'CRM', 'ADBE', 'PYPL', 'INTC', 'CSCO'
    ];
    
    const fallbackBist = [
      'THYAO', 'AKBNK', 'GARAN', 'ISCTR', 'TUPRS', 'KCHOL',
      'SAHOL', 'EREGL', 'ARCLK', 'BIMAS'
    ];

    const finalCrypto = crypto.length > 0 ? crypto : fallbackCrypto;
    const finalSpx = spx.length > 0 ? spx : fallbackSpx;
    const finalBist = bist.length > 0 ? bist : fallbackBist;

    console.log(`🌍 Universe loaded: ${finalCrypto.length} crypto, ${finalSpx.length} SPX, ${finalBist.length} BIST`);

    return {
      crypto: finalCrypto,
      spx: finalSpx,
      bist: finalBist,
      all: [...finalCrypto, ...finalSpx, ...finalBist]
    };
  }

  getUniverse(type: 'crypto' | 'spx' | 'bist' | 'all'): string[] {
    return this.config[type] || [];
  }

  getAllUniverses(): UniverseConfig {
    return { ...this.config };
  }

  getUniverseStats(): { crypto: number; spx: number; bist: number; total: number } {
    return {
      crypto: this.config.crypto.length,
      spx: this.config.spx.length,
      bist: this.config.bist.length,
      total: this.config.all.length
    };
  }

  // Add new symbol to a universe (for dynamic additions)
  addSymbol(universe: 'crypto' | 'spx' | 'bist', symbol: string): boolean {
    if (!this.config[universe].includes(symbol)) {
      this.config[universe].push(symbol);
      this.config.all = [...this.config.crypto, ...this.config.spx, ...this.config.bist];
      console.log(`✅ Added ${symbol} to ${universe} universe`);
      return true;
    }
    return false;
  }

  // Remove symbol from universe
  removeSymbol(universe: 'crypto' | 'spx' | 'bist', symbol: string): boolean {
    const index = this.config[universe].indexOf(symbol);
    if (index > -1) {
      this.config[universe].splice(index, 1);
      this.config.all = [...this.config.crypto, ...this.config.spx, ...this.config.bist];
      console.log(`🗑️ Removed ${symbol} from ${universe} universe`);
      return true;
    }
    return false;
  }

  // Get universe type for a symbol
  getSymbolUniverse(symbol: string): 'crypto' | 'spx' | 'bist' | null {
    if (this.config.crypto.includes(symbol)) return 'crypto';
    if (this.config.spx.includes(symbol)) return 'spx';
    if (this.config.bist.includes(symbol)) return 'bist';
    return null;
  }

  // Format universe for display
  formatUniverseDisplay(type: 'crypto' | 'spx' | 'bist' | 'all'): string {
    const symbols = this.getUniverse(type);
    const name = type.toUpperCase();
    return `**${name} Universe (${symbols.length} assets):**\n${symbols.join(', ')}`;
  }
}

// Global universe manager instance
export const universeManager = new UniverseManager();