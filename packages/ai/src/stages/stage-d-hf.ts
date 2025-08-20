// Stage-D High-Fidelity: Deep Single-Asset Decision with Ensemble
// Purpose: N=3 ensemble calls with rich context for maximum accuracy

import { PERFECTION_MODE_CONFIG, ENSEMBLE_MODELS, HF_OHLCV_REQUIREMENTS } from '../models/perfection-config';
import { callDecisionLLM, withTimeout } from '../stages/stage-d';

export interface StageDHFInput {
  asset: string;
  timeframe: string;
  confirm_tfs: string[];
  min_rr: number;
  leverage_cap: number;
  data_staleness_sec: number;
  ohlcv: {
    [timeframe: string]: {
      candles: any[];
    };
  };
  features: {
    price: number;
    atr_pct: number;
    rsi: number;
    ma50_slope: number;
    adx: number;
    trend_regime: string;
    trend_quality: number;
    vol_regime: string;
    atr_z: number;
  };
  microstructure: {
    ob: {
      imb10: number;
      ask_wall_bps: number;
      bid_wall_bps: number;
    };
    taker_buy_ratio_1h: number;
  };
  derivatives: {
    fund: number;
    oi: number;
    oi_d1: number;
    basis_bps: number;
    skew_25d: number;
  };
  sentiment: {
    news: number;
    social: number;
    fgi: number;
  };
  correlation: {
    beta_btc: number;
    beta_spx: number;
  };
  events: {
    earnings: any;
    macro: any;
    idiosyncratic: any;
  };
  quality: {
    age_sec: number;
    coverage: {
      price: boolean;
      ohlcv: boolean;
      derivatives: boolean;
      sentiment: boolean;
    };
  };
}

export interface DecisionHF {
  asset: string;
  market: 'crypto' | 'spx' | 'bist';
  timeframe: string;
  timestamp_ms: number;
  position: 'long' | 'short' | 'hold';
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
  rr_min: number;
  realized_rr_est: number;
  prob_win: number;
  ev_per_risk: number;
  kelly_frac: number;
  leverage: number;
  size_pct: number;
  data_quality: {
    age_sec: number;
    coverage: any;
    stale: boolean;
  };
  feature_scores: {
    trend: number;
    momentum: number;
    volatility: number;
    orderflow: number;
    derivatives: number;
    sentiment: number;
    risk: number;
  };
  confidence: number;
  rationale: string;
}

// High-Fidelity Stage-D System Prompt
export const STAGE_D_HF_SYSTEM_PROMPT = `You are AI Quant Strategist (HF). Produce a Decision JSON with full risk plan and expectancy metrics. If RR≥min_rr is not feasible, or inputs are stale/insufficient, set position:"hold" with low confidence and brief rationale. No extra keys.`;

// Create rich context prompt for Stage-D HF
export function createStageDHFPrompt(input: StageDHFInput): string {
  return `decision_request = ${JSON.stringify(input, null, 2)}
Return the Decision JSON only.`;
}

// Retry prompt for Stage-D HF
export const STAGE_D_HF_RETRY_PROMPT = `Reminder: Decision JSON only; ensure RR≥min_rr, include prob_win, ev_per_risk, and kelly_frac. No extra keys.`;

// Enhanced decision call with high-fidelity configuration
export async function callDecisionHF(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  seed?: number
): Promise<DecisionHF> {
  const config = {
    ...PERFECTION_MODE_CONFIG.decoding,
    timeout_ms: PERFECTION_MODE_CONFIG.timeouts.hard_timeout_ms
  };

  // Add seed for ensemble variance
  const requestConfig = {
    ...config,
    ...(seed && { seed })
  };

  try {
    return await withTimeout(
      callOpenRouterHF(systemPrompt, userPrompt, modelId, requestConfig),
      config.timeout_ms
    );
  } catch (error) {
    throw new Error(`HF Decision call failed: ${error instanceof Error ? error.message : error}`);
  }
}

// OpenRouter call with high-fidelity configuration
async function callOpenRouterHF(
  systemPrompt: string,
  userPrompt: string,
  modelId: string,
  config: any
): Promise<DecisionHF> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not found in environment');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://ai-trading-bot.local',
      'X-Title': 'AI Trading Bot HF Mode'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: config.temperature,
      top_p: config.top_p,
      max_tokens: config.max_output_tokens,
      seed: config.seed,
      stop: ['```', '\n\n', 'ranking', 'assets'],
      reasoning: modelId === 'openai/gpt-5-mini' ? {
        effort: "high",
        exclude: true,
        enabled: true
      } : undefined
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json() as any;
  
  console.log(`🔍 Stage-D HF API Response:`, {
    status: response.status,
    model: modelId,
    content_length: data.choices?.[0]?.message?.content?.length || 0,
    usage: data.usage
  });

  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error(`Empty response from ${modelId}. Response: ${JSON.stringify(data)}`);
  }

  return JSON.parse(content);
}

// Ensemble decision making with N=3 calls
export async function executeEnsembleDecision(
  input: StageDHFInput,
  models: string[] = ENSEMBLE_MODELS.map(m => m.id)
): Promise<DecisionHF> {
  console.log(`🤖 Stage-D HF: Running ensemble analysis for ${input.asset}`);
  
  const decisions: DecisionHF[] = [];
  const systemPrompt = STAGE_D_HF_SYSTEM_PROMPT;
  const userPrompt = createStageDHFPrompt(input);
  
  // Run N=3 calls with different seeds for variance
  for (let i = 0; i < PERFECTION_MODE_CONFIG.operating_profile.calls_per_asset; i++) {
    const modelId = models[i % models.length];
    const seed = 1000 + i; // Different seed for each call
    
    try {
      console.log(`🔬 Ensemble call ${i + 1}/3 using ${modelId}`);
      
      const decision = await callDecisionHF(systemPrompt, userPrompt, modelId, seed);
      decisions.push(decision);
      
    } catch (error) {
      console.error(`❌ Ensemble call ${i + 1} failed with ${modelId}:`, error);
      
      // Try retry with stricter prompt
      try {
        const retryPrompt = userPrompt + '\n\n' + STAGE_D_HF_RETRY_PROMPT;
        const decision = await callDecisionHF(systemPrompt, retryPrompt, modelId, seed);
        decisions.push(decision);
      } catch (retryError) {
        console.error(`❌ Retry also failed for call ${i + 1}`);
        // Continue with other calls
      }
    }
  }

  if (decisions.length === 0) {
    throw new Error(`All ensemble calls failed for ${input.asset}`);
  }

  console.log(`✅ Stage-D HF: ${decisions.length}/3 ensemble calls successful for ${input.asset}`);
  
  // Aggregate ensemble results
  return aggregateEnsembleDecisions(decisions, input.asset);
}

// Aggregate multiple decisions into consensus
function aggregateEnsembleDecisions(decisions: DecisionHF[], asset: string): DecisionHF {
  if (decisions.length === 1) {
    return decisions[0];
  }

  console.log(`🧮 Aggregating ${decisions.length} ensemble decisions for ${asset}`);

  // Majority vote for position
  const positions = decisions.map(d => d.position);
  const positionCounts = positions.reduce((acc, pos) => {
    acc[pos] = (acc[pos] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const consensusPosition = Object.entries(positionCounts)
    .sort(([,a], [,b]) => b - a)[0][0] as 'long' | 'short' | 'hold';

  // Filter decisions matching consensus position for numeric aggregation
  const consensusDecisions = decisions.filter(d => d.position === consensusPosition);
  
  if (consensusDecisions.length === 0) {
    // Fallback to first decision if no consensus
    return decisions[0];
  }

  // Calculate medians for numeric fields
  const getMedian = (values: number[]) => {
    const sorted = values.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };

  // Agreement factor for confidence adjustment
  const agreementFactor = consensusDecisions.length / decisions.length;
  
  // Use first consensus decision as template
  const template = consensusDecisions[0];
  
  // Aggregate numeric fields
  const aggregated: DecisionHF = {
    ...template,
    position: consensusPosition,
    entry: {
      type: 'zone',
      lower: getMedian(consensusDecisions.map(d => d.entry.lower)),
      upper: getMedian(consensusDecisions.map(d => d.entry.upper))
    },
    stop: getMedian(consensusDecisions.map(d => d.stop)),
    targets: template.targets, // Use template targets (could be improved)
    realized_rr_est: getMedian(consensusDecisions.map(d => d.realized_rr_est)),
    prob_win: getMedian(consensusDecisions.map(d => d.prob_win)),
    ev_per_risk: getMedian(consensusDecisions.map(d => d.ev_per_risk)),
    kelly_frac: Math.min(0.2, getMedian(consensusDecisions.map(d => d.kelly_frac))), // Cap at 20%
    confidence: getMedian(consensusDecisions.map(d => d.confidence)) * agreementFactor,
    feature_scores: {
      trend: getMedian(consensusDecisions.map(d => d.feature_scores.trend)),
      momentum: getMedian(consensusDecisions.map(d => d.feature_scores.momentum)),
      volatility: getMedian(consensusDecisions.map(d => d.feature_scores.volatility)),
      orderflow: getMedian(consensusDecisions.map(d => d.feature_scores.orderflow)),
      derivatives: getMedian(consensusDecisions.map(d => d.feature_scores.derivatives)),
      sentiment: getMedian(consensusDecisions.map(d => d.feature_scores.sentiment)),
      risk: getMedian(consensusDecisions.map(d => d.feature_scores.risk))
    },
    rationale: `Ensemble consensus (${decisions.length} calls, ${(agreementFactor * 100).toFixed(0)}% agreement): ${template.rationale}`
  };

  console.log(`🎯 ${asset} ensemble result: ${consensusPosition} (${(aggregated.confidence * 100).toFixed(0)}% confidence, ${agreementFactor * 100}% agreement)`);
  
  return aggregated;
}

// Validate decision meets HF requirements
export function validateDecisionHF(decision: DecisionHF, minRR: number = 2.0): boolean {
  // Basic validation
  if (decision.position === 'hold') {
    return true; // HOLDs are always valid
  }

  // Check RR requirement
  if (decision.realized_rr_est < minRR) {
    console.warn(`⚠️ ${decision.asset}: RR ${decision.realized_rr_est} below minimum ${minRR}`);
    return false;
  }

  // Check confidence threshold
  if (decision.confidence < 0.6) {
    console.warn(`⚠️ ${decision.asset}: Confidence ${decision.confidence} below threshold 0.6`);
    return false;
  }

  // Check Kelly fraction is reasonable
  if (decision.kelly_frac > 0.2) {
    console.warn(`⚠️ ${decision.asset}: Kelly fraction ${decision.kelly_frac} exceeds 20% cap`);
    return false;
  }

  // Check EV consistency
  const expectedEV = decision.prob_win * decision.realized_rr_est - (1 - decision.prob_win);
  if (Math.abs(decision.ev_per_risk - expectedEV) > 0.5) {
    console.warn(`⚠️ ${decision.asset}: EV calculation inconsistency`);
    return false;
  }

  return true;
}