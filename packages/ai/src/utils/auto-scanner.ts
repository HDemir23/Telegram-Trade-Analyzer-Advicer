// Automated Market Scanner
// Runs comprehensive analysis every 6h/12h and finds best opportunities

import { MultiFunnelOrchestrator } from '../orchestration/portfolio-funnel';
import { universeManager } from '../data/universe-config';
import { analyzeAssetV2 } from '../core/main-orchestrator';

export interface ScanResult {
  timestamp: number;
  timeframe: string;
  opportunities: OpportunityResult[];
  marketOverview: MarketOverview;
  topPicks: StrategyRecommendation[];
}

export interface OpportunityResult {
  symbol: string;
  universe: string;
  score: number;
  direction: 'long' | 'short' | 'hold';
  confidence: number;
  rr_ratio: number;
  entry_zone: { lower: number; upper: number };
  stop_loss: number;
  take_profit: number[];
  timeframe: string;
  strategy_type: 'trend_continuation' | 'mean_reversion' | 'breakout';
  rationale: string;
}

export interface MarketOverview {
  crypto_sentiment: 'bullish' | 'bearish' | 'neutral';
  spx_sentiment: 'bullish' | 'bearish' | 'neutral';
  bist_sentiment: 'bullish' | 'bearish' | 'neutral';
  overall_regime: 'risk_on' | 'risk_off' | 'mixed';
  volatility_level: 'low' | 'medium' | 'high';
  total_opportunities: number;
}

export interface StrategyRecommendation {
  symbol: string;
  strategy: string;
  entry: string;
  stop: string;
  target: string;
  risk_reward: string;
  confidence: string;
  timeframe: string;
  allocation: string;
}

export class AutoScanner {
  private orchestrator = new MultiFunnelOrchestrator();
  private isScanning = false;
  private lastScanTime = 0;
  private scanInterval: NodeJS.Timeout | null = null;

  constructor() {
    console.log('🔍 AutoScanner initialized');
  }

  // Start automated scanning
  startAutoScanning(intervalHours: 6 | 12 = 6): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
    }

    const intervalMs = intervalHours * 60 * 60 * 1000;
    console.log(`🚀 Starting automated scanning every ${intervalHours}h`);

    // Run initial scan immediately
    this.runComprehensiveScan('6h').catch(console.error);

    // Schedule recurring scans
    this.scanInterval = setInterval(() => {
      this.runComprehensiveScan('6h').catch(console.error);
    }, intervalMs);
  }

  // Stop automated scanning
  stopAutoScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      console.log('⏹️ Automated scanning stopped');
    }
  }

  // Run comprehensive market scan
  async runComprehensiveScan(timeframe: '6h' | '12h' | '1d' = '6h'): Promise<ScanResult> {
    if (this.isScanning) {
      throw new Error('Scan already in progress');
    }

    this.isScanning = true;
    this.lastScanTime = Date.now();

    try {
      console.log(`🔍 Starting comprehensive ${timeframe} market scan...`);
      
      // Get all universes
      const allSymbols = universeManager.getUniverse('all');
      console.log(`📊 Scanning ${allSymbols.length} symbols across all markets`);

      // Run full funnel analysis
      const portfolioResult = await this.orchestrator.executeFullFunnel(allSymbols, timeframe, 15);

      // Analyze individual opportunities
      const opportunities = await this.analyzeOpportunities(portfolioResult.picks, timeframe);

      // Generate market overview
      const marketOverview = await this.generateMarketOverview(allSymbols);

      // Create strategy recommendations
      const topPicks = await this.generateStrategyRecommendations(opportunities.slice(0, 5));

      const result: ScanResult = {
        timestamp: Date.now(),
        timeframe,
        opportunities,
        marketOverview,
        topPicks
      };

      console.log(`✅ Scan complete: Found ${opportunities.length} opportunities`);
      return result;

    } finally {
      this.isScanning = false;
    }
  }

  // Analyze specific opportunities
  private async analyzeOpportunities(picks: any[], timeframe: string): Promise<OpportunityResult[]> {
    const opportunities: OpportunityResult[] = [];

    for (const pick of picks) {
      try {
        // Get detailed analysis for each pick
        const analysis = await analyzeAssetV2(pick.asset, 'openai/gpt-5-mini');
        
        const opportunity: OpportunityResult = {
          symbol: pick.asset,
          universe: universeManager.getSymbolUniverse(pick.asset) || 'unknown',
          score: pick.confidence * pick.expected_rr,
          direction: pick.position,
          confidence: pick.confidence,
          rr_ratio: pick.expected_rr,
          entry_zone: {
            lower: analysis.entry.lower || analysis.entry.price || 0,
            upper: analysis.entry.upper || analysis.entry.price || 0
          },
          stop_loss: analysis.stop || 0,
          take_profit: analysis.targets?.map(t => t.price) || [],
          timeframe: analysis.timeframe,
          strategy_type: this.determineStrategyType(analysis),
          rationale: analysis.rationale
        };

        opportunities.push(opportunity);
      } catch (error) {
        console.warn(`⚠️ Failed to analyze ${pick.asset}: ${error}`);
      }
    }

    // Sort by score (confidence * RR)
    return opportunities.sort((a, b) => b.score - a.score);
  }

  // Generate market overview
  private async generateMarketOverview(allSymbols: string[]): Promise<MarketOverview> {
    const crypto = universeManager.getUniverse('crypto');
    const spx = universeManager.getUniverse('spx');
    const bist = universeManager.getUniverse('bist');

    // Simple sentiment analysis based on symbol count and performance
    const cryptoSentiment = await this.calculateSentiment(crypto.slice(0, 10));
    const spxSentiment = await this.calculateSentiment(spx.slice(0, 10));
    const bistSentiment = await this.calculateSentiment(bist.slice(0, 10));

    const sentiments = [cryptoSentiment, spxSentiment, bistSentiment];
    const bullishCount = sentiments.filter(s => s === 'bullish').length;
    const bearishCount = sentiments.filter(s => s === 'bearish').length;

    let overallRegime: 'risk_on' | 'risk_off' | 'mixed' = 'mixed';
    if (bullishCount >= 2) overallRegime = 'risk_on';
    else if (bearishCount >= 2) overallRegime = 'risk_off';

    return {
      crypto_sentiment: cryptoSentiment,
      spx_sentiment: spxSentiment,
      bist_sentiment: bistSentiment,
      overall_regime: overallRegime,
      volatility_level: 'medium', // TODO: Calculate from ATR data
      total_opportunities: allSymbols.length
    };
  }

  // Calculate sentiment for a universe
  private async calculateSentiment(symbols: string[]): Promise<'bullish' | 'bearish' | 'neutral'> {
    // Simple implementation - in production would use more sophisticated analysis
    const sample = symbols.slice(0, 5);
    let bullish = 0;
    let bearish = 0;

    for (const symbol of sample) {
      try {
        const analysis = await analyzeAssetV2(symbol, 'openai/gpt-5-mini');
        if (analysis.position === 'long') bullish++;
        else if (analysis.position === 'short') bearish++;
      } catch {
        // Ignore errors for sentiment calculation
      }
    }

    if (bullish > bearish) return 'bullish';
    if (bearish > bullish) return 'bearish';
    return 'neutral';
  }

  // Generate strategy recommendations
  private async generateStrategyRecommendations(opportunities: OpportunityResult[]): Promise<StrategyRecommendation[]> {
    return opportunities.map(opp => ({
      symbol: opp.symbol,
      strategy: this.formatStrategyType(opp.strategy_type),
      entry: this.formatPrice(opp.entry_zone.lower, opp.entry_zone.upper),
      stop: this.formatPrice(opp.stop_loss),
      target: opp.take_profit.map(tp => this.formatPrice(tp)).join(' / '),
      risk_reward: `${opp.rr_ratio.toFixed(1)}:1`,
      confidence: `${Math.round(opp.confidence * 100)}%`,
      timeframe: opp.timeframe,
      allocation: this.calculateAllocation(opp.confidence, opp.rr_ratio)
    }));
  }

  // Helper methods
  private determineStrategyType(analysis: any): 'trend_continuation' | 'mean_reversion' | 'breakout' {
    // Simple logic based on analysis - can be enhanced
    if (analysis.feature_scores.trend > 0.7) return 'trend_continuation';
    if (analysis.feature_scores.rsi_signal > 0.7) return 'mean_reversion';
    return 'breakout';
  }

  private formatStrategyType(type: string): string {
    switch (type) {
      case 'trend_continuation': return 'Trend Continuation';
      case 'mean_reversion': return 'Mean Reversion';
      case 'breakout': return 'Breakout';
      default: return 'Mixed Strategy';
    }
  }

  private formatPrice(price: number, upperPrice?: number): string {
    if (upperPrice && upperPrice !== price) {
      return `$${price.toFixed(4)} - $${upperPrice.toFixed(4)}`;
    }
    return `$${price.toFixed(4)}`;
  }

  private calculateAllocation(confidence: number, rr: number): string {
    const baseAllocation = confidence * rr * 0.5; // Simple allocation model
    const percentage = Math.max(1, Math.min(5, Math.round(baseAllocation * 100)));
    return `${percentage}%`;
  }

  // Get scan status
  getScanStatus() {
    return {
      isScanning: this.isScanning,
      lastScanTime: this.lastScanTime,
      nextScanTime: this.scanInterval ? this.lastScanTime + (6 * 60 * 60 * 1000) : null
    };
  }
}

// Global scanner instance
export const autoScanner = new AutoScanner();