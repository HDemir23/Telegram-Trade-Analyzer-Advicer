// Stage-P High-Fidelity: Portfolio Construction with EV and Kelly
// Purpose: Select 3 optimal positions maximizing Q = confidence × RR

import { DecisionHF } from '../stages/stage-d-hf';
import { HF_RISK_LIMITS } from '../models/perfection-config';

export interface PortfolioHF {
  final_picks: FinalPickHF[];
  reserves_pct: number;
  diversification: {
    pairwise_max_corr: number;
    sector_spread: string[];
  };
  kelly_total: number;
  expected_ev: number;
}

export interface FinalPickHF {
  asset: string;
  market: 'crypto' | 'spx' | 'bist';
  position: 'long' | 'short';
  entry: {
    type: 'zone';
    lower: number;
    upper: number;
  };
  stop: number;
  targets: Array<{
    price: number;
    size_pct: number;
  }>;
  expected_rr: number;
  confidence: number;
  prob_win: number;
  ev_per_risk: number;
  kelly_frac: number;
  size_pct: number;
  overlap_beta: number;
  notes: string;
}

// Enhanced eligibility filtering for high-fidelity mode
export function filterEligibleHF(decisions: DecisionHF[]): DecisionHF[] {
  return decisions.filter(d => {
    // Basic eligibility
    if (d.position === "hold") return false;
    if (d.data_quality.stale) return false;
    if (d.confidence < HF_RISK_LIMITS.min_confidence) return false;
    if (d.realized_rr_est < HF_RISK_LIMITS.min_rr) return false;
    
    // High-fidelity additional checks
    if (d.prob_win <= 0 || d.prob_win >= 1) return false;
    if (d.ev_per_risk <= 0) return false;
    if (d.kelly_frac <= 0 || d.kelly_frac > HF_RISK_LIMITS.kelly_cap) return false;
    
    return true;
  });
}

// Calculate enhanced quality score for ranking
export function calculateQualityScore(d: DecisionHF): number {
  // Base quality: confidence × RR
  const baseQ = d.confidence * d.realized_rr_est;
  
  // EV adjustment: weight by expected value per risk
  const evAdjustment = Math.min(2, Math.max(0.5, d.ev_per_risk));
  
  // Kelly adjustment: prefer optimal bet sizes
  const kellyAdjustment = Math.min(1.2, 1 + d.kelly_frac * 2);
  
  // Win probability adjustment
  const probAdjustment = Math.min(1.3, 0.5 + d.prob_win);
  
  return baseQ * evAdjustment * kellyAdjustment * probAdjustment;
}

// Estimate correlation between assets with enhanced logic
export function estimateCorrelationHF(asset1: string, asset2: string, decisions: DecisionHF[]): number {
  // Get decision objects for beta calculations
  const d1 = decisions.find(d => d.asset === asset1);
  const d2 = decisions.find(d => d.asset === asset2);
  
  // Enhanced correlation estimation using feature scores
  const isCrypto1 = asset1.includes('USDT');
  const isCrypto2 = asset2.includes('USDT');
  const isBist1 = /^(THYAO|AKBNK|TUPRS|EREGL|KOZAA|GARAN|ISCTR|KCHOL|SAHOL|ARCLK|BIMAS)/.test(asset1);
  const isBist2 = /^(THYAO|AKBNK|TUPRS|EREGL|KOZAA|GARAN|ISCTR|KCHOL|SAHOL|ARCLK|BIMAS)/.test(asset2);
  
  let baseCorr = 0.2; // Default cross-asset correlation
  
  if (isCrypto1 && isCrypto2) {
    baseCorr = 0.7; // Crypto-crypto correlation
  } else if (!isCrypto1 && !isCrypto2 && !isBist1 && !isBist2) {
    baseCorr = 0.5; // Stock-stock correlation
  } else if (isBist1 && isBist2) {
    baseCorr = 0.6; // BIST-BIST correlation
  }
  
  // Adjust based on feature score similarity if available
  if (d1 && d2) {
    const trendSimilarity = 1 - Math.abs(d1.feature_scores.trend - d2.feature_scores.trend);
    const momentumSimilarity = 1 - Math.abs(d1.feature_scores.momentum - d2.feature_scores.momentum);
    const avgSimilarity = (trendSimilarity + momentumSimilarity) / 2;
    
    // Adjust correlation based on feature similarity
    baseCorr = baseCorr * (0.7 + 0.3 * avgSimilarity);
  }
  
  return Math.min(0.95, baseCorr);
}

// Apply correlation constraints with high-fidelity logic
export function applyCorrelationConstraintsHF(
  decisions: DecisionHF[],
  correlationCaps = HF_RISK_LIMITS.correlation_caps
): DecisionHF[] {
  if (decisions.length <= 1) return decisions;
  
  console.log(`🔗 Applying HF correlation constraints to ${decisions.length} candidates`);
  
  const selected: DecisionHF[] = [decisions[0]]; // Start with highest quality
  
  for (let i = 1; i < decisions.length; i++) {
    const candidate = decisions[i];
    
    let hasHighCorr = false;
    let maxCorr = 0;
    
    for (const selectedAsset of selected) {
      const corr = estimateCorrelationHF(candidate.asset, selectedAsset.asset, decisions);
      maxCorr = Math.max(maxCorr, corr);
      
      // Check specific correlation caps
      const candidateCrypto = candidate.asset.includes('USDT');
      const selectedCrypto = selectedAsset.asset.includes('USDT');
      const candidateBist = /^(THYAO|AKBNK|TUPRS|EREGL|KOZAA|GARAN|ISCTR|KCHOL|SAHOL|ARCLK|BIMAS)/.test(candidate.asset);
      const selectedBist = /^(THYAO|AKBNK|TUPRS|EREGL|KOZAA|GARAN|ISCTR|KCHOL|SAHOL|ARCLK|BIMAS)/.test(selectedAsset.asset);
      
      let corrCap = correlationCaps.cross_asset;
      if (candidateCrypto && selectedCrypto) {
        corrCap = correlationCaps.crypto_crypto;
      } else if (!candidateCrypto && !selectedCrypto && !candidateBist && !selectedBist) {
        corrCap = correlationCaps.stock_stock;
      }
      
      if (corr > corrCap) {
        hasHighCorr = true;
        console.log(`⚠️ ${candidate.asset} excluded: ${corr.toFixed(2)} correlation with ${selectedAsset.asset} > ${corrCap}`);
        break;
      }
    }
    
    if (!hasHighCorr) {
      selected.push(candidate);
      console.log(`✅ ${candidate.asset} added: max correlation ${maxCorr.toFixed(2)}`);
    }
    
    // Stop at max positions
    if (selected.length >= HF_RISK_LIMITS.max_positions) break;
  }
  
  return selected;
}

// Calculate Kelly-optimal position sizing
export function calculateKellyOptimalSizing(
  picks: DecisionHF[],
  riskBudget: number = 60
): number[] {
  if (picks.length === 0) return [];
  
  console.log(`📊 Calculating Kelly-optimal sizing for ${picks.length} positions`);
  
  // Start with individual Kelly fractions
  const kellySizes = picks.map(pick => pick.kelly_frac * 100); // Convert to percentages
  
  // Scale down if total exceeds risk budget
  const totalKelly = kellySizes.reduce((sum, size) => sum + size, 0);
  
  if (totalKelly > riskBudget) {
    const scaleFactor = riskBudget / totalKelly;
    console.log(`⚖️ Scaling Kelly sizes by ${scaleFactor.toFixed(2)} to fit ${riskBudget}% budget`);
    return kellySizes.map(size => Math.round(size * scaleFactor));
  }
  
  return kellySizes.map(size => Math.round(size));
}

// Calculate overlap beta for diversification
function calculateOverlapBeta(asset: string, portfolio: DecisionHF[]): number {
  if (portfolio.length <= 1) return 0;
  
  const assetDecision = portfolio.find(d => d.asset === asset);
  if (!assetDecision) return 0;
  
  // Calculate average correlation with other portfolio assets
  const otherAssets = portfolio.filter(d => d.asset !== asset);
  const correlations = otherAssets.map(other => 
    estimateCorrelationHF(asset, other.asset, portfolio)
  );
  
  return correlations.length > 0 
    ? correlations.reduce((sum, corr) => sum + corr, 0) / correlations.length 
    : 0;
}

// Main Stage-P high-fidelity portfolio construction
export function constructPortfolioHF(
  decisions: DecisionHF[],
  maxPicks: number = HF_RISK_LIMITS.max_positions
): PortfolioHF {
  console.log(`💼 Stage P HF: Constructing portfolio from ${decisions.length} decisions`);
  
  // 1. Filter eligible decisions
  const eligible = filterEligibleHF(decisions);
  console.log(`💼 Stage P HF: ${eligible.length} eligible decisions after filtering`);
  
  if (eligible.length === 0) {
    return {
      final_picks: [],
      reserves_pct: 100,
      diversification: {
        pairwise_max_corr: 0,
        sector_spread: []
      },
      kelly_total: 0,
      expected_ev: 0
    };
  }
  
  // 2. Sort by enhanced quality score
  const sorted = eligible
    .map(d => ({ ...d, quality: calculateQualityScore(d) }))
    .sort((a, b) => b.quality - a.quality);
  
  console.log(`🎯 Top candidates by quality:`, 
    sorted.slice(0, 5).map(d => `${d.asset}: ${d.quality.toFixed(2)}`));
  
  // 3. Apply correlation constraints
  const unconstrained = sorted.slice(0, Math.min(10, sorted.length));
  const picks = applyCorrelationConstraintsHF(unconstrained);
  
  // 4. Calculate Kelly-optimal sizing
  const sizes = calculateKellyOptimalSizing(picks, 60);
  
  // 5. Build final picks with enhanced metrics
  const finalPicks: FinalPickHF[] = picks.map((pick, i) => {
    const overlapBeta = calculateOverlapBeta(pick.asset, picks);
    const sizePercentage = sizes[i] || Math.floor(60 / picks.length);
    
    // Determine market classification
    let market: 'crypto' | 'spx' | 'bist' = 'spx';
    if (pick.asset.includes('USDT')) {
      market = 'crypto';
    } else if (/^(THYAO|AKBNK|TUPRS|EREGL|GARAN|ISCTR|KCHOL|SAHOL|ARCLK|BIMAS)/.test(pick.asset)) {
      market = 'bist';
    }
    
    return {
      asset: pick.asset,
      market,
      position: pick.position as 'long' | 'short', // Already filtered - no holds
      entry: pick.entry,
      stop: pick.stop,
      targets: pick.targets,
      expected_rr: pick.realized_rr_est,
      confidence: pick.confidence,
      prob_win: pick.prob_win,
      ev_per_risk: pick.ev_per_risk,
      kelly_frac: pick.kelly_frac,
      size_pct: sizePercentage,
      overlap_beta: overlapBeta,
      notes: `HF selected: Q=${calculateQualityScore(pick).toFixed(2)}, β=${overlapBeta.toFixed(2)}`
    };
  });
  
  // 6. Calculate portfolio metrics
  const usedCapital = finalPicks.reduce((sum, pick) => sum + pick.size_pct, 0);
  const reserves = 100 - usedCapital;
  
  // Calculate diversification metrics
  const correlations: number[] = [];
  for (let i = 0; i < finalPicks.length; i++) {
    for (let j = i + 1; j < finalPicks.length; j++) {
      const corr = estimateCorrelationHF(
        finalPicks[i].asset, 
        finalPicks[j].asset, 
        picks
      );
      correlations.push(corr);
    }
  }
  
  const maxCorr = correlations.length > 0 ? Math.max(...correlations) : 0;
  
  const sectors = [...new Set(finalPicks.map(pick => {
    if (pick.market === 'crypto') return 'Crypto';
    if (pick.market === 'bist') return 'BIST';
    return 'SPX';
  }))];
  
  // Calculate total Kelly and expected EV
  const kellyTotal = finalPicks.reduce((sum, pick) => sum + pick.kelly_frac, 0);
  const expectedEV = finalPicks.reduce((sum, pick) => 
    sum + (pick.size_pct / 100) * pick.ev_per_risk, 0
  );
  
  console.log(`💼 Portfolio constructed: ${finalPicks.length} picks, ${reserves}% reserves, ${maxCorr.toFixed(2)} max correlation`);
  
  return {
    final_picks: finalPicks,
    reserves_pct: Math.max(HF_RISK_LIMITS.default_reserves_pct, reserves),
    diversification: {
      pairwise_max_corr: maxCorr,
      sector_spread: sectors
    },
    kelly_total: kellyTotal,
    expected_ev: expectedEV
  };
}

// Validate portfolio meets high-fidelity requirements
export function validatePortfolioHF(portfolio: PortfolioHF): boolean {
  // Check basic constraints
  if (portfolio.final_picks.length > HF_RISK_LIMITS.max_positions) {
    console.error(`❌ Portfolio has ${portfolio.final_picks.length} picks, max allowed: ${HF_RISK_LIMITS.max_positions}`);
    return false;
  }
  
  // Check correlation constraints
  if (portfolio.diversification.pairwise_max_corr > 0.8) {
    console.error(`❌ Portfolio max correlation ${portfolio.diversification.pairwise_max_corr} exceeds 0.8`);
    return false;
  }
  
  // Check reserves
  if (portfolio.reserves_pct < HF_RISK_LIMITS.default_reserves_pct && portfolio.final_picks.length === HF_RISK_LIMITS.max_positions) {
    console.error(`❌ Portfolio reserves ${portfolio.reserves_pct}% below minimum ${HF_RISK_LIMITS.default_reserves_pct}%`);
    return false;
  }
  
  // Check Kelly total is reasonable
  if (portfolio.kelly_total > 0.5) {
    console.warn(`⚠️ Total Kelly fraction ${portfolio.kelly_total} is high`);
  }
  
  // Validate individual picks
  for (const pick of portfolio.final_picks) {
    if (pick.expected_rr < HF_RISK_LIMITS.min_rr) {
      console.error(`❌ Pick ${pick.asset} has RR ${pick.expected_rr} below minimum ${HF_RISK_LIMITS.min_rr}`);
      return false;
    }
    
    if (pick.confidence < HF_RISK_LIMITS.min_confidence) {
      console.error(`❌ Pick ${pick.asset} has confidence ${pick.confidence} below minimum ${HF_RISK_LIMITS.min_confidence}`);
      return false;
    }
  }
  
  return true;
}