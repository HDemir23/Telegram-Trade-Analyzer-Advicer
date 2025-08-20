// ═══════════════════════════════════════════════════════════════════════════════
// 🧠 AI TRADING ENGINE - CLEAN ORGANIZED EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────────────────────────
// 🔥 CORE ENGINE - Main Analysis Components
// ──────────────────────────────────────────────────────────────────────────────
export * from './core/main-orchestrator';      // Main AI analysis engine
export * from './core/decision-schema';        // Decision validation & schemas

// ──────────────────────────────────────────────────────────────────────────────
// 🤖 AI MODELS & CONFIGURATION  
// ──────────────────────────────────────────────────────────────────────────────
export * from './models/ai-models';            // AI model configurations
export * from './models/perfection-config';    // High-precision mode settings

// ──────────────────────────────────────────────────────────────────────────────
// 📊 ANALYSIS SYSTEMS
// ──────────────────────────────────────────────────────────────────────────────
export * from './analysis/iterative-analyzer'; // Multi-question analysis system
export * from './analysis/market-regime';      // Market regime detection

// ──────────────────────────────────────────────────────────────────────────────
// 🔗 ORCHESTRATION SYSTEMS
// ──────────────────────────────────────────────────────────────────────────────
export { MultiFunnelOrchestrator } from './orchestration/portfolio-funnel';   // Multi-stage portfolio analysis
export { ScreeningRequest, ScreeningResult, PortfolioRequest } from './orchestration/funnel-schemas';     // Portfolio schemas & validation
export * from './orchestration/chain-workflow';     // Advanced chained workflows
export * from './orchestration/high-freq-orchestrator'; // High-frequency trading

// ──────────────────────────────────────────────────────────────────────────────
// 📈 MULTI-STAGE PIPELINE
// ──────────────────────────────────────────────────────────────────────────────
export { StageSContract, STAGE_S_SYSTEM_PROMPT, combineStageSResults } from './stages/stage-s';              // Screening stage (standard)
export { executeStageSHF, mergeStageSResults } from './stages/stage-s-hf';       // Screening stage (high-freq)
export { callDecisionLLM, STAGE_D_SYSTEM_PROMPT } from './stages/stage-d';       // Decision stage (standard) 
export { executeEnsembleDecision, validateDecisionHF } from './stages/stage-d-hf'; // Decision stage (high-freq)
export { constructPortfolioHF, validatePortfolioHF } from './stages/stage-p-hf'; // Portfolio stage (high-freq)

// ──────────────────────────────────────────────────────────────────────────────
// 💾 DATA MANAGEMENT
// ──────────────────────────────────────────────────────────────────────────────
export * from './data/market-cache';           // Market data caching system
export * from './data/universe-config';        // Symbol universe configuration

// ──────────────────────────────────────────────────────────────────────────────
// 🛠️ UTILITIES & TOOLS
// ──────────────────────────────────────────────────────────────────────────────
export * from './utils/sanitizer';             // Contract firewall & sanitization
export * from './utils/data-freshness';        // Data staleness monitoring
export * from './utils/auto-scanner';          // Automated asset scanning
export * from './utils/position-tracker';      // Position tracking utilities
export * from './utils/debug';                 // Debug & logging utilities

// ──────────────────────────────────────────────────────────────────────────────
// 🔄 LEGACY COMPATIBILITY LAYER (Temporary)
// ──────────────────────────────────────────────────────────────────────────────
export const buildAnalysisRequest = (params: any) => ({});
export const askMultiAssetPlan = (request: any) => Promise.resolve({});

export interface AiOutput {
  decision: string;
  confidence: number;
  reasoning: string;
  entryZone?: any;
  stopLoss?: any;
  takeProfit?: any;
  position?: string;
  horizon?: string;
  entry?: any;
  stop_loss?: any;
  take_profits?: any[];
  leverage?: number;
  expected_rr?: number;
  indicator_snapshot?: any;
  rationale?: any;
  key_levels?: any;
  timestamp?: number;
  version?: string;
  symbol?: string;
  timeframe?: string;
  invalid_if?: string[];
  assumptions?: string[];
}

export const generateQuantPrompt = (request: any, model?: any): Promise<AiOutput> => Promise.resolve({
  decision: 'HOLD',
  confidence: 50,
  reasoning: 'Legacy function stub - use V3 bot for analysis'
});

// ──────────────────────────────────────────────────────────────────────────────
// 📋 ORGANIZED STRUCTURE SUMMARY
// ──────────────────────────────────────────────────────────────────────────────
/*
packages/ai/src/
├── core/                    # Core engine components
│   ├── main-orchestrator.ts # Main AI analysis engine
│   └── decision-schema.ts   # Decision validation schemas
├── models/                  # AI model configurations  
│   ├── ai-models.ts        # Model definitions & settings
│   └── perfection-config.ts # High-precision configurations
├── analysis/                # Analysis algorithms
│   ├── iterative-analyzer.ts # Multi-question analysis
│   └── market-regime.ts     # Market regime detection
├── orchestration/           # Complex workflow systems
│   ├── portfolio-funnel.ts  # Multi-stage portfolio
│   ├── funnel-schemas.ts    # Portfolio schemas
│   ├── chain-workflow.ts    # Chained workflows
│   └── high-freq-orchestrator.ts # HF trading
├── stages/                  # Multi-stage pipeline
│   ├── stage-s.ts & stage-s-hf.ts # Screening
│   ├── stage-d.ts & stage-d-hf.ts # Decision
│   └── stage-p.ts & stage-p-hf.ts # Portfolio
├── data/                    # Data management
│   ├── market-cache.ts      # Market data cache
│   └── universe-config.ts   # Symbol universes
└── utils/                   # Utilities & tools
    ├── sanitizer.ts         # Contract firewall
    ├── data-freshness.ts    # Staleness monitoring
    ├── auto-scanner.ts      # Asset scanning
    ├── position-tracker.ts  # Position tracking
    └── debug.ts            # Debug utilities
*/