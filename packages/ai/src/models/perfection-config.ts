// Perfection Mode Configuration - High-Fidelity Prompt Pack
// Purpose: maximize edge and profit expectancy (not speed/cost)

export interface PerfectionModeConfig {
  operating_profile: {
    purpose: 'best_possible_output';
    timeframes: {
      primary: '6h';
      confirm: ['1h', '1d'];
    };
    data_policy: 'real_ohlcv_only';
    model_mix: {
      primary: string;
      secondary: string[];
    };
    calls_per_asset: number;
  };
  decoding: {
    temperature: number;
    top_p: number;
    max_output_tokens: number;
  };
  timeouts: {
    hard_timeout_ms: number;
    retries: number;
  };
}

export const PERFECTION_MODE_CONFIG: PerfectionModeConfig = {
  operating_profile: {
    purpose: 'best_possible_output',
    timeframes: {
      primary: '6h',
      confirm: ['1h', '1d']
    },
    data_policy: 'real_ohlcv_only',
    model_mix: {
      primary: 'openai/gpt-5-mini',
      secondary: ['anthropic/claude-3.5-sonnet', 'openai/gpt-4o']
    },
    calls_per_asset: 3 // N=3 ensemble for Stage-D
  },
  decoding: {
    temperature: 0.15,
    top_p: 0.9,
    max_output_tokens: 2000
  },
  timeouts: {
    hard_timeout_ms: 20000, // 20s per call
    retries: 2
  }
};

// Enhanced output schema for Perfection Mode
export interface PerfectionModeOutput {
  run_id: string;
  timeframe: string;
  markets: string[];
  started_at: string;
  completed_at: string;
  market_overview: {
    crypto: MarketRegime;
    spx: MarketRegime;
    bist: MarketRegime;
    overall_regime: 'bull' | 'bear' | 'mixed';
  };
  top_candidates: TopCandidate[];
  final_picks: FinalPick[];
  reserves_pct: number;
  diagnostics: Diagnostics;
  data_quality: DataQuality;
}

interface MarketRegime {
  regime: 'bullish' | 'bearish' | 'neutral';
  breadth: {
    adv: number;
    dec: number;
    neu: number;
  };
  vol_rank: number;
}

interface TopCandidate {
  symbol: string;
  market: 'crypto' | 'spx' | 'bist';
  dir: 'long' | 'short' | 'none';
  score: number;
  rr_potential: number;
  confidence: number;
  risks: string[];
  drivers: string[];
  reason: string; // <=120 chars
}

interface FinalPick {
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

interface Diagnostics {
  evaluated: number;
  eligible: number;
  stale_count: number;
  timeouts: number;
  llm: {
    stage_s_batches: number;
    stage_d_calls: number;
    avg_latency_ms: number;
  };
  data: {
    synthetic_used_stageD: number;
    ohlcv_missing: {
      spx: number;
      bist: number;
      crypto: number;
    };
  };
}

interface DataQuality {
  crypto: {
    avg_age_sec: number;
    stale_ratio: number;
  };
  spx: {
    avg_age_sec: number;
    stale_ratio: number;
  };
  bist: {
    avg_age_sec: number;
    stale_ratio: number;
  };
}

// Ensemble model configuration
export interface EnsembleModel {
  id: string;
  weight: number;
  role: 'primary' | 'secondary' | 'tie_breaker';
}

export const ENSEMBLE_MODELS: EnsembleModel[] = [
  {
    id: 'openai/gpt-5-mini',
    weight: 0.5,
    role: 'primary'
  },
  {
    id: 'anthropic/claude-3.5-sonnet',
    weight: 0.3,
    role: 'secondary'
  },
  {
    id: 'openai/gpt-4o',
    weight: 0.2,
    role: 'tie_breaker'
  }
];

// Scoring rubric for Stage-S
export interface ScoringRubric {
  trend: number;
  momentum: number;
  vol_fit: number;
  orderbook: number;
  derivatives: number;
  sentiment: number;
  correlation: number;
  penalties: {
    stale: number;
    synthetic: number;
    illiquid: number;
    event_risk: number;
    conflicting_signals: number;
  };
}

export const HF_SCORING_RUBRIC: ScoringRubric = {
  trend: 0.35,
  momentum: 0.20,
  vol_fit: 0.15,
  orderbook: 0.10,
  derivatives: 0.10,
  sentiment: 0.05,
  correlation: 0.05,
  penalties: {
    stale: -0.3,
    synthetic: -0.4,
    illiquid: -0.2,
    event_risk: -0.15,
    conflicting_signals: -0.25
  }
};

// OHLCV requirements for high-fidelity mode
export const HF_OHLCV_REQUIREMENTS = {
  '6h': { candles: 240, description: '180-240 full candles' },
  '1h': { candles: 240, description: '240 full candles' },
  '1d': { candles: 120, description: '120 full candles' }
};

// Risk limits for perfection mode
export const HF_RISK_LIMITS = {
  correlation_caps: {
    crypto_crypto: 0.7,
    stock_stock: 0.5,
    cross_asset: 0.6
  },
  kelly_cap: 0.2, // Conservative cap
  min_confidence: 0.60,
  min_rr: 2.0,
  max_positions: 3,
  default_reserves_pct: 40
};