// Stage-P Portfolio Selection with eligibility and risk parity - V3
// Ensures only valid decisions pass through with proper sizing

import { Decision } from '../core/decision-schema';

export interface PortfolioResult {
  picks: Decision[];
  reserves_pct: number;
  diversification: {
    pairwise_max_corr: number;
    sector_spread: string[];
  };
}

// V3 Stage-P eligibility filters
export function filterEligible(decisions: Decision[]): Decision[] {
  return decisions.filter(d => 
    d.position !== "hold" && 
    !d.data_quality.stale && 
    d.confidence >= 0.60 &&
    d.realized_rr_est >= 2.0 // Minimum R:R requirement
  );
}

// Calculate decision score for ranking
export function calculateScore(d: Decision): number {
  return d.confidence * (d.realized_rr_est || d.rr_min || 1);
}

// Risk parity position sizing
export function riskParitySizes(picks: Decision[], riskBudget: number = 60): number[] {
  if (picks.length === 0) return [];
  
  // Use ATR as risk proxy (higher ATR = lower position size)
  const risks = picks.map(p => {
    const atr = (p.data_quality as any)?.atr_pct || 0.02; // Default 2% ATR if missing
    return Math.max(0.005, atr); // Minimum 0.5% risk
  });
  
  // Inverse risk weighting
  const invRisks = risks.map(r => 1 / r);
  const totalInvRisk = invRisks.reduce((a, b) => a + b, 0) || 1;
  
  // Allocate budget proportionally to inverse risk
  return picks.map((_, i) => 
    Math.round((invRisks[i] / totalInvRisk) * riskBudget)
  );
}

// Check correlation between assets (simplified)
export function estimateCorrelation(asset1: string, asset2: string): number {
  // Simplified correlation estimates
  const cryptoCorr = 0.7; // Crypto assets are highly correlated
  const stockCorr = 0.5;  // Stocks have moderate correlation
  const crossCorr = 0.2;  // Cross-asset correlation is low
  
  const isCrypto1 = asset1.includes('USDT');
  const isCrypto2 = asset2.includes('USDT');
  
  if (isCrypto1 && isCrypto2) return cryptoCorr;
  if (!isCrypto1 && !isCrypto2) return stockCorr;
  return crossCorr;
}

// Apply correlation cap to portfolio
export function applyCorrelationCap(decisions: Decision[], maxCorr: number = 0.8): Decision[] {
  if (decisions.length <= 1) return decisions;
  
  const selected: Decision[] = [decisions[0]]; // Start with highest scoring
  
  for (let i = 1; i < decisions.length; i++) {
    const candidate = decisions[i];
    
    // Check correlation with already selected assets
    const hasHighCorr = selected.some(selected => 
      estimateCorrelation(candidate.asset, selected.asset) > maxCorr
    );
    
    if (!hasHighCorr) {
      selected.push(candidate);
    }
    
    // Stop at 3 positions max
    if (selected.length >= 3) break;
  }
  
  return selected;
}

// Main Stage-P portfolio selection
export function selectPortfolio(decisions: Decision[], maxPicks: number = 3): PortfolioResult {
  console.log(`💼 Stage P: Selecting ${maxPicks} positions from ${decisions.length} decisions`);
  
  // Filter eligible decisions
  const eligible = filterEligible(decisions);
  console.log(`💼 Stage P: ${eligible.length} valid decisions after filtering`);
  
  if (eligible.length === 0) {
    return {
      picks: [],
      reserves_pct: 100,
      diversification: {
        pairwise_max_corr: 0,
        sector_spread: []
      }
    };
  }
  
  // Sort by score (confidence * R:R)
  const sorted = eligible
    .map(d => ({ ...d, score: calculateScore(d) }))
    .sort((a, b) => b.score - a.score);
  
  // Apply correlation cap and select top picks
  const uncapped = sorted.slice(0, Math.min(10, sorted.length)); // Consider top 10
  const picks = applyCorrelationCap(uncapped, 0.8).slice(0, maxPicks);
  
  // Calculate risk parity sizes
  const sizes = riskParitySizes(picks, 60); // 60% of capital allocated
  
  // Update position sizes
  picks.forEach((pick, i) => {
    pick.size_pct = sizes[i] || 20; // Default 20% if calculation fails
  });
  
  // Calculate diversification metrics
  const correlations = picks.flatMap((p1, i) => 
    picks.slice(i + 1).map(p2 => estimateCorrelation(p1.asset, p2.asset))
  );
  const maxCorr = correlations.length > 0 ? Math.max(...correlations) : 0;
  
  const sectors = picks.map(p => {
    if (p.asset.includes('USDT')) return 'Crypto';
    if (['THYAO', 'AKBNK', 'GARAN', 'ISCTR', 'TUPRS', 'KCHOL', 'SAHOL', 'EREGL', 'ARCLK', 'BIMAS'].some(symbol => p.asset.includes(symbol))) return 'BIST';
    return 'SPX';
  });
  
  const usedCapital = picks.reduce((sum, p) => sum + (p.size_pct || 0), 0);
  
  return {
    picks,
    reserves_pct: 100 - usedCapital,
    diversification: {
      pairwise_max_corr: maxCorr,
      sector_spread: [...new Set(sectors)]
    }
  };
}

// V3 Stage-P System Prompt
export const STAGE_P_SYSTEM_PROMPT = `You are AI Portfolio Selector. From validated Decisions, pick EXACTLY 3 positions maximizing Q = confidence*RR with correlation cap and risk parity sizing. Output Stage-P JSON only.`;