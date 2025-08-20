// Advanced Chained AI Workflow System
// Iteratively refines trading strategies until best possible output is achieved

import { Decision, DecisionSchema, validateAndRepair } from '../core/decision-schema';
import { marketDataCache } from '../data/market-cache';
import { getModelConfig } from '../models/ai-models';

export interface WorkflowStage {
  id: string;
  name: string;
  description: string;
  inputSchema?: any;
  outputSchema?: any;
  maxIterations: number;
  convergenceThreshold: number;
}

export interface StageResult {
  stageId: string;
  iteration: number;
  input: any;
  output: any;
  confidence: number;
  quality: number;
  convergenceScore: number;
  improvements: string[];
  nextStageReady: boolean;
}

export interface ChainedWorkflowResult {
  workflowId: string;
  asset: string;
  totalStages: number;
  completedStages: number;
  totalIterations: number;
  finalDecision: Decision;
  stageResults: StageResult[];
  overallQuality: number;
  convergenceAchieved: boolean;
  executionTime: number;
}

// Define workflow stages for strategy refinement
const STRATEGY_WORKFLOW_STAGES: WorkflowStage[] = [
  {
    id: 'data_analysis',
    name: 'Market Data Analysis',
    description: 'Analyze raw market data and identify patterns',
    maxIterations: 3,
    convergenceThreshold: 0.85
  },
  {
    id: 'technical_screening', 
    name: 'Technical Indicator Screening',
    description: 'Apply technical indicators and filter opportunities',
    maxIterations: 4,
    convergenceThreshold: 0.80
  },
  {
    id: 'risk_assessment',
    name: 'Risk Analysis & Position Sizing',
    description: 'Assess risks and determine optimal position sizing',
    maxIterations: 3,
    convergenceThreshold: 0.90
  },
  {
    id: 'strategy_optimization',
    name: 'Strategy Parameter Optimization',
    description: 'Fine-tune entry/exit parameters for maximum efficiency',
    maxIterations: 5,
    convergenceThreshold: 0.88
  },
  {
    id: 'final_validation',
    name: 'Final Decision Validation',
    description: 'Validate and produce final trading decision',
    maxIterations: 2,
    convergenceThreshold: 0.92
  },
  {
    id: 'strict_formatter',
    name: 'Strict Output Formatter',
    description: 'Enforce exact JSON structure: coin, confidence, current_price, entry_price, tp, sl, additional',
    maxIterations: 1,
    convergenceThreshold: 0.95
  }
];

export class ChainedWorkflowEngine {
  private model: string;
  private workflowStages: WorkflowStage[];

  constructor(model: string = 'openai/gpt-5-mini') {
    this.model = model;
    this.workflowStages = STRATEGY_WORKFLOW_STAGES;
  }

  async executeChainedWorkflow(
    asset: string,
    initialData?: any,
    customStages?: WorkflowStage[]
  ): Promise<ChainedWorkflowResult> {
    
    const startTime = Date.now();
    const workflowId = `${asset}_${startTime}`;
    const stages = customStages || this.workflowStages;
    
    console.log(`🔗 Starting chained workflow for ${asset} with ${stages.length} stages`);
    
    const stageResults: StageResult[] = [];
    let currentInput = initialData || await this.gatherInitialData(asset);
    let totalIterations = 0;
    
    // Execute each stage sequentially
    for (let stageIndex = 0; stageIndex < stages.length; stageIndex++) {
      const stage = stages[stageIndex];
      console.log(`\n🎯 Stage ${stageIndex + 1}/${stages.length}: ${stage.name}`);
      
      const stageResult = await this.executeStage(
        stage,
        asset,
        currentInput,
        stageIndex === stages.length - 1 // isLastStage
      );
      
      stageResults.push(stageResult);
      totalIterations += stageResult.iteration;
      
      // Use stage output as input for next stage
      currentInput = stageResult.output;
      
      // Check if we should continue or stop
      if (!stageResult.nextStageReady && stageIndex < stages.length - 1) {
        console.log(`⚠️ Stage ${stage.name} failed to converge, using best available result`);
      }
    }
    
    // Extract final decision from last stage
    const lastResult = stageResults[stageResults.length - 1];
    const finalDecision = this.extractFinalDecision(lastResult.output);
    
    const executionTime = Date.now() - startTime;
    const overallQuality = this.calculateOverallQuality(stageResults);
    const convergenceAchieved = stageResults.every(r => r.convergenceScore >= (r.stageId === 'final_validation' ? 0.92 : 0.80));
    
    console.log(`\n✅ Chained workflow completed in ${executionTime}ms`);
    console.log(`📊 Overall Quality: ${(overallQuality * 100).toFixed(1)}%`);
    console.log(`🎯 Convergence: ${convergenceAchieved ? 'ACHIEVED' : 'PARTIAL'}`);
    
    return {
      workflowId,
      asset,
      totalStages: stages.length,
      completedStages: stageResults.length,
      totalIterations,
      finalDecision,
      stageResults,
      overallQuality,
      convergenceAchieved,
      executionTime
    };
  }

  private async executeStage(
    stage: WorkflowStage,
    asset: string,
    input: any,
    isLastStage: boolean
  ): Promise<StageResult> {
    
    let bestResult: any = null;
    let bestQuality = 0;
    let iteration = 0;
    let improvements: string[] = [];
    
    console.log(`  🔄 Executing stage: ${stage.description}`);
    
    // Iterative refinement within stage
    for (iteration = 1; iteration <= stage.maxIterations; iteration++) {
      console.log(`    Iteration ${iteration}/${stage.maxIterations}`);
      
      try {
        const prompt = this.buildStagePrompt(stage, asset, input, bestResult, improvements, iteration, isLastStage);
        const response = await this.callAI(prompt, stage.id, iteration);
        
        const result = await this.parseStageResponse(response, stage, isLastStage);
        const quality = this.evaluateResultQuality(result, stage);
        
        console.log(`    Quality: ${(quality * 100).toFixed(1)}%`);
        
        if (quality > bestQuality) {
          bestResult = result;
          bestQuality = quality;
          
          // Check convergence
          if (quality >= stage.convergenceThreshold) {
            console.log(`    ✅ Converged at iteration ${iteration}`);
            break;
          }
        }
        
        // Identify improvements for next iteration
        if (iteration < stage.maxIterations) {
          improvements = await this.identifyImprovements(result, stage, quality);
        }
        
      } catch (error) {
        console.log(`    ⚠️ Iteration ${iteration} failed: ${error}`);
        continue;
      }
    }
    
    const convergenceScore = bestQuality;
    const nextStageReady = convergenceScore >= (stage.convergenceThreshold * 0.8); // 80% of threshold
    
    return {
      stageId: stage.id,
      iteration,
      input,
      output: bestResult,
      confidence: this.extractConfidence(bestResult),
      quality: bestQuality,
      convergenceScore,
      improvements,
      nextStageReady
    };
  }

  private buildStagePrompt(
    stage: WorkflowStage,
    asset: string,
    input: any,
    previousResult: any,
    improvements: string[],
    iteration: number,
    isLastStage: boolean
  ): string {
    
    let prompt = `# ${stage.name} - ${stage.description}
    
Asset: ${asset}
Iteration: ${iteration}/${stage.maxIterations}
Stage ID: ${stage.id}

## Current Input Data:
${JSON.stringify(input, null, 2)}
`;

    if (previousResult && improvements.length > 0) {
      prompt += `
## Previous Result Analysis:
${JSON.stringify(previousResult, null, 2)}

## Areas for Improvement:
${improvements.map(imp => `- ${imp}`).join('\n')}
`;
    }

    // Stage-specific prompts
    switch (stage.id) {
      case 'data_analysis':
        prompt += `
## Task:
Analyze the market data and identify:
1. Key price patterns and trends
2. Volume characteristics
3. Support and resistance levels
4. Market regime (trending/ranging/volatile)

Provide detailed analysis with confidence scores.
`;
        break;

      case 'technical_screening':
        prompt += `
## Task:
Apply technical analysis and screen for:
1. Momentum indicators (RSI, MACD, Stochastic)
2. Trend indicators (Moving averages, ADX)
3. Volatility measures (ATR, Bollinger Bands)
4. Volume analysis (OBV, Volume Profile)

Rate each indicator and provide screening decision.
`;
        break;

      case 'risk_assessment':
        prompt += `
## Task:
Assess risk and determine:
1. Maximum position size based on volatility
2. Optimal stop-loss placement
3. Risk-reward ratio calculation
4. Market conditions impact on risk

Provide risk metrics and position sizing recommendation.
`;
        break;

      case 'strategy_optimization':
        prompt += `
## Task:
Optimize strategy parameters:
1. Entry timing and conditions
2. Exit strategy (targets and stops)
3. Position management rules
4. Strategy robustness across market conditions

Provide optimized parameters with backtesting insights.
`;
        break;

      case 'final_validation':
        prompt += `
## Task:
Produce comprehensive trading decision analysis. Include:
1. Position recommendation (long/short/hold)
2. Entry strategy and price levels
3. Risk management (stop loss, targets)
4. Confidence assessment and rationale
5. Technical analysis summary

Provide detailed analysis with all relevant factors.
`;
        break;

      case 'strict_formatter':
        prompt += `
## CRITICAL TASK: FORMAT ENFORCEMENT
You are a strict JSON formatter. Your ONLY job is to extract trading information from the previous analysis and format it into this EXACT structure:

{
  "coin": "${asset}",
  "confidence": 0.75,
  "current_price": 50000.00,
  "entry_price": 49500.00,
  "tp": 52000.00,
  "sl": 47000.00,
  "additional": "Brief rationale"
}

RULES:
- coin: Asset symbol (string)
- confidence: 0.0-1.0 decimal (number)
- current_price: Current market price (number)
- entry_price: Recommended entry price (number)
- tp: Take profit target (number)
- sl: Stop loss level (number)
- additional: Max 100 chars rationale (string)

MANDATORY: Return ONLY the JSON. No explanations. No commentary. No markdown.
If previous analysis says HOLD, set entry_price = current_price, tp = current_price, sl = current_price.
`;
        break;
    }

    if (!isLastStage) {
      prompt += `
## Output Requirements:
Provide structured data that will be used by the next stage. Include:
- Analysis results
- Confidence scores
- Key metrics
- Recommendations for next stage
`;
    }

    prompt += `
## Quality Requirements:
- Be precise and data-driven
- Provide confidence scores for all assessments
- Identify uncertainties and limitations
- Suggest improvements if confidence is low
`;

    return prompt;
  }

  private async callAI(prompt: string, stageId: string, iteration: number): Promise<string> {
    const config = getModelConfig(this.model);
    const openRouterUrl = "https://openrouter.ai/api/v1/chat/completions";
    
    const payload = {
      ...config,
      messages: [
        {
          role: "system",
          content: "You are an expert quantitative trading analyst. Provide precise, data-driven analysis."
        },
        {
          role: "user", 
          content: prompt
        }
      ]
    };

    console.log(`    🤖 AI call: ${stageId} iteration ${iteration}`);

    const response = await fetch(openRouterUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'AI Trading Bot V3 - Chained Workflow'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json() as any;
    
    if (data.error) {
      throw new Error(`AI Error: ${data.error.message}`);
    }

    return data.choices?.[0]?.message?.content || '';
  }

  private async parseStageResponse(response: string, stage: WorkflowStage, isLastStage: boolean): Promise<any> {
    if (stage.id === 'strict_formatter') {
      // Strict formatter must return clean JSON
      try {
        const cleanResponse = this.cleanFormatterResponse(response);
        const parsed = JSON.parse(cleanResponse);
        
        // Validate the strict format
        if (this.validateStrictFormat(parsed)) {
          return parsed;
        } else {
          throw new Error('Formatter response missing required fields');
        }
      } catch (error) {
        console.log(`❌ Strict formatter failed: ${error}`);
        // Create fallback format from previous stage data
        return this.createFallbackFormat(stage, response);
      }
    } else if (isLastStage) {
      // Legacy final validation stage
      try {
        const cleanResponse = response.trim().replace(/```json\n?|\n?```/g, '');
        return JSON.parse(cleanResponse);
      } catch (error) {
        try {
          const partialDecision = {
            asset: 'BTCUSDT',
            position: 'hold' as const,
            confidence: 0.5
          };
          const repaired = validateAndRepair(partialDecision, 0.02, 50000);
          if (repaired) return repaired;
        } catch (repairError) {
          // Ignore repair errors and throw original
        }
        throw new Error('Failed to parse final JSON decision');
      }
    } else {
      // Non-final stages return structured analysis
      return {
        analysis: response,
        timestamp: Date.now(),
        stage: stage.id
      };
    }
  }

  private cleanFormatterResponse(response: string): string {
    return response
      .trim()
      // Remove any explanatory text before JSON
      .replace(/^.*?(?=\{)/s, '')
      // Remove any text after JSON
      .replace(/\}.*$/s, '}')
      // Remove markdown formatting
      .replace(/```json\n?/g, '')
      .replace(/\n?```/g, '')
      .trim();
  }

  private validateStrictFormat(data: any): boolean {
    const requiredFields = ['coin', 'confidence', 'current_price', 'entry_price', 'tp', 'sl', 'additional'];
    
    for (const field of requiredFields) {
      if (!(field in data)) {
        console.log(`❌ Missing required field: ${field}`);
        return false;
      }
    }

    // Type validation
    if (typeof data.coin !== 'string') return false;
    if (typeof data.confidence !== 'number' || data.confidence < 0 || data.confidence > 1) return false;
    if (typeof data.current_price !== 'number') return false;
    if (typeof data.entry_price !== 'number') return false;
    if (typeof data.tp !== 'number') return false;
    if (typeof data.sl !== 'number') return false;
    if (typeof data.additional !== 'string' || data.additional.length > 100) return false;

    return true;
  }

  private createFallbackFormat(stage: WorkflowStage, response: string): any {
    // Extract basic info from response text as fallback
    const asset = response.match(/(?:asset|symbol|coin)[:\s]*([A-Z]+)/i)?.[1] || 'UNKNOWN';
    const confidence = response.match(/confidence[:\s]*(\d+(?:\.\d+)?)/i)?.[1] || '0.5';
    
    return {
      coin: asset,
      confidence: Math.min(parseFloat(confidence), 1.0),
      current_price: 50000, // Default fallback
      entry_price: 50000,
      tp: 52000,
      sl: 48000,
      additional: "Fallback format due to parsing error"
    };
  }

  private evaluateResultQuality(result: any, stage: WorkflowStage): number {
    if (!result) return 0;

    let quality = 0.5; // Base quality

    // Stage-specific quality evaluation
    switch (stage.id) {
      case 'data_analysis':
        if (result.analysis?.length > 200) quality += 0.2;
        if (result.analysis?.includes('confidence')) quality += 0.1;
        if (result.analysis?.includes('pattern') || result.analysis?.includes('trend')) quality += 0.2;
        break;

      case 'technical_screening':
        if (result.analysis?.includes('RSI') || result.analysis?.includes('MACD')) quality += 0.15;
        if (result.analysis?.includes('volume')) quality += 0.15;
        if (result.analysis?.includes('momentum')) quality += 0.2;
        break;

      case 'risk_assessment':
        if (result.analysis?.includes('risk') || result.analysis?.includes('stop')) quality += 0.2;
        if (result.analysis?.includes('position size') || result.analysis?.includes('volatility')) quality += 0.2;
        if (result.analysis?.includes('ratio')) quality += 0.1;
        break;

      case 'strategy_optimization':
        if (result.analysis?.includes('entry') || result.analysis?.includes('exit')) quality += 0.2;
        if (result.analysis?.includes('optimize') || result.analysis?.includes('parameter')) quality += 0.15;
        if (result.analysis?.includes('backtest')) quality += 0.15;
        break;

      case 'final_validation':
        if (result.asset && result.position && result.confidence) quality += 0.3;
        if (result.entry && result.stop && result.targets) quality += 0.2;
        if (result.rationale && result.feature_scores) quality += 0.2;
        if (typeof result.confidence === 'number' && result.confidence > 0) quality += 0.1;
        break;
        
      case 'strict_formatter':
        // High quality requirements for the formatter
        if (this.validateStrictFormat(result)) quality += 0.4;
        if (result.confidence > 0.3 && result.confidence < 0.9) quality += 0.2; // Reasonable confidence
        if (result.additional && result.additional.length > 10) quality += 0.2; // Has rationale
        if (result.tp !== result.sl && result.entry_price !== result.current_price) quality += 0.2; // Distinct levels
        break;
    }

    return Math.min(quality, 1.0);
  }

  private async identifyImprovements(result: any, stage: WorkflowStage, quality: number): Promise<string[]> {
    const improvements: string[] = [];
    
    if (quality < 0.6) {
      improvements.push('Increase analysis depth and provide more detailed explanations');
    }
    
    if (quality < 0.7) {
      improvements.push('Include more quantitative metrics and confidence scores');
    }
    
    if (quality < 0.8) {
      improvements.push('Consider additional market factors and risk scenarios');
    }

    // Stage-specific improvements
    switch (stage.id) {
      case 'data_analysis':
        if (!result.analysis?.includes('support') || !result.analysis?.includes('resistance')) {
          improvements.push('Identify key support and resistance levels');
        }
        break;
        
      case 'technical_screening':
        if (!result.analysis?.includes('divergence')) {
          improvements.push('Look for indicator divergences and confirmations');
        }
        break;
        
      case 'final_validation':
        if (!result.rationale || result.rationale.length < 50) {
          improvements.push('Provide more comprehensive rationale for the trading decision');
        }
        break;
    }

    return improvements;
  }

  private extractConfidence(result: any): number {
    if (typeof result?.confidence === 'number') {
      return result.confidence;
    }
    
    // Extract confidence from analysis text
    const confidenceMatch = result?.analysis?.match(/confidence[:\s]+(\d+(?:\.\d+)?)/i);
    if (confidenceMatch) {
      return Math.min(parseFloat(confidenceMatch[1]) / 100, 1.0);
    }
    
    return 0.6; // Default confidence
  }

  private extractFinalDecision(result: any): Decision {
    if (result && result.asset && result.position) {
      return result as Decision;
    }
    
    // Create fallback decision
    return {
      asset: 'UNKNOWN',
      market: 'crypto' as const,
      timeframe: '1h' as const,
      timestamp_ms: Date.now(),
      position: 'hold' as const,
      confidence: 0.5,
      entry: { lower: 0, upper: 0, type: 'zone' as const },
      stop: 0,
      targets: [{ price: 0, size_pct: 0 }],
      rr_min: 1.0,
      realized_rr_est: 1.0,
      leverage: 1,
      size_pct: 0,
      rationale: 'Failed to generate valid decision',
      feature_scores: { trend: 0.5, momentum: 0.5, rsi_signal: 0.5, risk: 0.8 },
      data_quality: { 
        age_sec: 0,
        coverage: { price: true },
        stale: false 
      }
    };
  }

  private calculateOverallQuality(stageResults: StageResult[]): number {
    if (stageResults.length === 0) return 0;
    
    const weights = [0.15, 0.20, 0.25, 0.25, 0.15]; // Weight each stage
    let weightedSum = 0;
    let totalWeight = 0;
    
    stageResults.forEach((result, index) => {
      const weight = weights[index] || 0.2;
      weightedSum += result.quality * weight;
      totalWeight += weight;
    });
    
    return totalWeight > 0 ? weightedSum / totalWeight : 0;
  }

  private async gatherInitialData(asset: string): Promise<any> {
    console.log(`📊 Gathering initial data for ${asset}...`);
    
    const ohlcvResult = await marketDataCache.getOHLCV(asset, 168); // 7 days hourly
    
    return {
      asset,
      ohlcv: ohlcvResult.data,
      fromCache: ohlcvResult.fromCache,
      timestamp: Date.now(),
      dataPoints: ohlcvResult.data.length
    };
  }
}

// Export factory function
export function createChainedWorkflow(model?: string): ChainedWorkflowEngine {
  return new ChainedWorkflowEngine(model);
}

// Export convenience function for single asset analysis
export async function analyzeAssetWithChain(
  asset: string,
  model?: string,
  customStages?: WorkflowStage[]
): Promise<ChainedWorkflowResult> {
  const engine = new ChainedWorkflowEngine(model);
  return engine.executeChainedWorkflow(asset, undefined, customStages);
}