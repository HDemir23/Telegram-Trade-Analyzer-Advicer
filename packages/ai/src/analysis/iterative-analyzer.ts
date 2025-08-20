// Iterative Analysis System - Ask Multiple Questions for Best Results
// This system asks the AI multiple focused questions to get comprehensive analysis

import { Decision, DecisionSchema, validateAndRepair } from '../core/decision-schema';
import { RegimeAnalysis } from '../analysis/market-regime';
import { toCompactLines } from '../core/main-orchestrator';

export interface AnalysisQuestion {
  id: string;
  question: string;
  focus: string;
  maxTokens: number;
}

export interface QuestionResponse {
  questionId: string;
  response: string;
  confidence: number;
  keyInsights: string[];
}

export interface IterativeAnalysisResult {
  asset: string;
  questions: QuestionResponse[];
  finalDecision: Decision;
  overallConfidence: number;
  consensusFactors: string[];
  output?: string; // 7-line compact output
}

// Streamlined questions for efficient, high-quality analysis
export const ANALYSIS_QUESTIONS: AnalysisQuestion[] = [
  {
    id: "market_assessment",
    question: "Quick market assessment: trend direction, key levels, and trade opportunity. Be concise.",
    focus: "Market direction and opportunity",
    maxTokens: 400
  },
  {
    id: "final_decision",
    question: "Trading decision with exact JSON format. Must include position, confidence, entry, stop, target.",
    focus: "Final structured decision",
    maxTokens: 800
  }
];

export class IterativeAnalyzer {
  
  async analyzeAssetIteratively(
    symbol: string, 
    marketData: any, 
    regime: RegimeAnalysis,
    model: string = 'openai/gpt-5-mini'
  ): Promise<IterativeAnalysisResult> {
    
    console.log(`🔄 Starting streamlined analysis for ${symbol} with ${ANALYSIS_QUESTIONS.length} efficient questions...`);
    
    const responses: QuestionResponse[] = [];
    const insights: string[] = [];
    const candidates: any[] = [];
    
    // Ask each question with quality filtering
    for (const question of ANALYSIS_QUESTIONS) {
      console.log(`❓ Question ${question.id}: ${question.focus}`);
      
      const maxAttempts = question.id === 'final_decision' ? 2 : 1; // Limited iterations
      let bestResponse: QuestionResponse | null = null;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          console.log(`  🔄 Attempt ${attempt}/${maxAttempts}`);
          
          const response = await Promise.race([
            this.askFocusedQuestion(
              symbol,
              marketData,
              regime,
              question,
              responses,
              model,
              attempt
            ),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Question timeout after 30s')), 30000) // Reduced timeout
            )
          ]) as QuestionResponse;
          
          // Quality gate: Only accept high-confidence responses
          if (response.confidence >= 0.6 || question.id === 'market_assessment') {
            bestResponse = response;
            console.log(`✅ ${question.id}: ${response.confidence.toFixed(1)}% confidence (accepted)`);
            break;
          } else {
            console.log(`⚠️ ${question.id}: ${response.confidence.toFixed(1)}% confidence (below threshold)`);
            if (attempt === maxAttempts) {
              bestResponse = response; // Use best available on final attempt
            }
          }
          
        } catch (error) {
          console.log(`❌ Attempt ${attempt} failed: ${error}`);
          if (attempt === maxAttempts) {
            // Create minimal fallback
            bestResponse = {
              questionId: question.id,
              response: `Analysis failed: ${error}`,
              confidence: 0.1,
              keyInsights: [`${question.focus} analysis incomplete`]
            };
          }
        }
        
        await new Promise(resolve => setTimeout(resolve, 100)); // Brief delay between attempts
      }
      
      if (bestResponse) {
        responses.push(bestResponse);
        insights.push(...bestResponse.keyInsights);
        
        // Collect decision candidates for final selection
        if (question.id === 'final_decision' && bestResponse.response.includes('{')) {
          candidates.push(this.extractDecisionCandidate(bestResponse.response, marketData));
        }
      }
    }
    
    // Select best decision from candidates using scoring
    let finalDecision: Decision;
    
    if (candidates.length > 0) {
      console.log(`🎯 Evaluating ${candidates.length} decision candidates...`);
      const bestCandidate = this.selectBestCandidate(candidates, symbol, marketData);
      finalDecision = bestCandidate;
    } else {
      console.log('⚠️ No valid candidates, creating fallback decision');
      finalDecision = this.createFallbackDecision(symbol, marketData, regime, responses);
    }
    
    // Apply sanity checks and auto-corrections
    finalDecision = this.applySanityChecks(finalDecision, marketData);
    
    // Apply confidence filter - only output trades above 60% confidence
    if (finalDecision.confidence < 0.6) {
      console.log(`🚫 Low confidence (${(finalDecision.confidence * 100).toFixed(0)}%), forcing HOLD`);
      finalDecision.position = 'hold';
      finalDecision.entry = { lower: 0, upper: 0, type: 'zone' as const };
      finalDecision.stop = 0;
      finalDecision.targets = [{ price: 0, size_pct: 100 }];
    }
    
    // Calculate overall confidence as weighted average
    const weights = [0.3, 0.2, 0.5]; // Give more weight to final decision
    const overallConfidence = responses.reduce((sum, response, index) => {
      return sum + (response.confidence * (weights[index] || 0.2));
    }, 0);
    
    // Extract consensus factors
    const consensusFactors = this.extractConsensusFactors(responses);
    
    console.log(`🎯 Iterative analysis complete: ${overallConfidence.toFixed(1)}% confidence, ${consensusFactors.length} consensus factors`);
    
    // Generate compact 7-line output
    const compactOutput = toCompactLines(finalDecision, marketData.price);
    
    return {
      asset: symbol,
      questions: responses,
      finalDecision,
      overallConfidence,
      consensusFactors,
      output: compactOutput
    };
  }
  
  private async askFocusedQuestion(
    symbol: string,
    marketData: any,
    regime: RegimeAnalysis,
    question: AnalysisQuestion,
    previousContext: QuestionResponse[],
    model: string,
    attempt: number = 1
  ): Promise<QuestionResponse> {
    
    // Build context from previous questions
    const contextSummary = previousContext.length > 0 
      ? `\n📋 PREVIOUS INSIGHTS:\n${previousContext.map(r => `• ${r.questionId}: ${r.keyInsights.join(', ')}`).join('\n')}\n`
      : '';
    
    const systemPrompt = `Expert trading analyst focused on ${question.focus}.

TASK: ${question.question}

🎯 CRITICAL REQUIREMENTS:
- Be extremely concise and focused
- Include confidence % (0-100) 
- Use specific numbers only
- NO fluff or explanatory text
${attempt > 1 ? '\n🚨 RETRY: Previous response failed quality check. Must meet exact format requirements.' : ''}

${question.id === 'final_decision' ? 
  '📋 OUTPUT: Valid JSON only. No explanations. Format: {"position":"long/short/hold","confidence":0.75,"entry":45000,"stop":42000,"targets":[47000]}' :
  '📋 OUTPUT: Brief analysis + confidence % + 2-3 key insights. Max 200 words.'
}

⚠️ QUALITY GATE: Only confident analysis above 60% will be accepted.`;

    const userPrompt = `ASSET: ${symbol}
DATA: Price=${marketData.price}, RSI=${marketData.rsi?.toFixed(1)}, ATR=${marketData.atr?.toFixed(3)}%, Trend=${regime.trend_regime}, Strength=${regime.trend_strength?.toFixed(1)}

${contextSummary}

QUESTION: ${question.question}

${question.id === 'final_synthesis' ? 
  'REQUIRED: Complete JSON decision with exact schema.' :
  'REQUIRED: Analysis + confidence % + 3 key insights.'
}`;

    try {
      const { callOpenRouterAI } = await import('../core/main-orchestrator');
      const response = await callOpenRouterAI(systemPrompt, userPrompt, model);
      
      if (!response || (typeof response === 'string' && response.trim() === '')) {
        throw new Error('Empty response from AI');
      }
      
      const responseText = typeof response === 'string' ? response : JSON.stringify(response);
      
      // Extract confidence and insights
      const confidence = this.extractConfidence(responseText);
      const keyInsights = this.extractKeyInsights(responseText, question.focus);
      
      return {
        questionId: question.id,
        response: responseText,
        confidence,
        keyInsights
      };
      
    } catch (error) {
      throw new Error(`Question ${question.id} failed: ${error}`);
    }
  }
  
  private extractConfidence(text: string): number {
    // Look for confidence patterns in the text
    const patterns = [
      /confidence[:\s]+(\d+(?:\.\d+)?)%/i,
      /(\d+(?:\.\d+)?)%\s*confidence/i,
      /"confidence"[:\s]*(\d+(?:\.\d+)?)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        return value > 1 ? value / 100 : value; // Normalize to 0-1
      }
    }
    
    // Default confidence based on text quality
    return text.length > 200 ? 0.7 : 0.5;
  }
  
  private extractKeyInsights(text: string, focus: string): string[] {
    const insights: string[] = [];
    
    // Look for bullet points, numbered lists, or key phrases
    const patterns = [
      /[•·▪▫]\s*([^•·▪▫\n]{10,100})/g,
      /\d+[\.)]\s*([^\d\n]{10,100})/g,
      /(?:key|main|important|critical)[:\s]+([^.\n]{20,150})/gi
    ];
    
    for (const pattern of patterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].trim().length > 10) {
          insights.push(match[1].trim());
        }
      }
    }
    
    // If no structured insights found, extract key sentences
    if (insights.length === 0) {
      const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20 && s.trim().length < 150);
      insights.push(...sentences.slice(0, 3).map(s => s.trim()));
    }
    
    return insights.slice(0, 5); // Limit to 5 key insights
  }
  
  private createFallbackDecision(
    symbol: string,
    marketData: any,
    regime: RegimeAnalysis,
    responses: QuestionResponse[]
  ): Decision {
    
    // Analyze responses to determine position
    const positiveSignals = responses.filter(r => 
      r.response.toLowerCase().includes('bullish') || 
      r.response.toLowerCase().includes('long') ||
      r.response.toLowerCase().includes('buy')
    ).length;
    
    const negativeSignals = responses.filter(r =>
      r.response.toLowerCase().includes('bearish') ||
      r.response.toLowerCase().includes('short') ||
      r.response.toLowerCase().includes('sell')
    ).length;
    
    const avgConfidence = responses.reduce((sum, r) => sum + r.confidence, 0) / responses.length;
    
    let position: "long" | "short" | "hold" = "hold";
    let confidence = Math.min(avgConfidence, 0.4); // Cap fallback confidence
    
    if (positiveSignals > negativeSignals && avgConfidence > 0.6) {
      position = "long";
    } else if (negativeSignals > positiveSignals && avgConfidence > 0.6) {
      position = "short";
    }
    
    const fallbackDecision = {
      asset: symbol,
      market: symbol.includes('USDT') ? 'crypto' as const : 'equity' as const,
      timeframe: '6h' as const,
      timestamp_ms: Date.now(),
      position,
      entry: { 
        type: 'zone' as const, 
        lower: position === 'hold' ? 0 : marketData.price * 0.998, 
        upper: position === 'hold' ? 0 : marketData.price * 1.002 
      },
      stop: position === 'long' ? marketData.price * 0.95 : 
            position === 'short' ? marketData.price * 1.05 : 0,
      targets: position === 'hold' ? [{ price: 0, size_pct: 100 }] : [
        { price: position === 'long' ? marketData.price * 1.1 : marketData.price * 0.9, size_pct: 100 }
      ],
      rr_min: 2.5,
      realized_rr_est: position === 'hold' ? 0 : 2.5,
      leverage: 0,
      size_pct: 20,
      data_quality: {
        age_sec: marketData.age_sec || 60,
        coverage: {
          price: true,
          orderbook: false,
          derivatives: false,
          sentiment: false,
          correlations: false
        },
        stale: marketData.age_sec > 300
      },
      feature_scores: {
        trend: regime.trend_regime === 'up' ? 0.8 : regime.trend_regime === 'down' ? 0.2 : 0.5,
        momentum: marketData.rsi > 60 ? 0.7 : marketData.rsi < 40 ? 0.3 : 0.5,
        rsi_signal: marketData.rsi < 30 ? 0.8 : marketData.rsi > 70 ? 0.2 : 0.5,
        risk: regime.volatility_regime === 'high' ? 0.8 : 0.3
      },
      confidence,
      rationale: `Iterative analysis: ${positiveSignals} bullish vs ${negativeSignals} bearish signals. Avg confidence: ${(avgConfidence * 100).toFixed(0)}%`
    };
    
    return validateAndRepair(fallbackDecision, marketData.atr || 0.02, marketData.price);
  }
  
  private extractDecisionCandidate(response: string, marketData: any): any {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          ...parsed,
          _score: this.scoreCandidate(parsed, response),
          _length: response.length
        };
      }
    } catch (error) {
      console.log(`⚠️ Failed to parse candidate: ${error}`);
    }
    return null;
  }

  private scoreCandidate(candidate: any, response: string): number {
    let score = 0;
    
    // Scoring criteria (higher is better)
    if (candidate.position && ['long', 'short', 'hold'].includes(candidate.position)) score += 20;
    if (typeof candidate.confidence === 'number' && candidate.confidence >= 0.6) score += 30;
    if (candidate.entry && typeof candidate.entry === 'number') score += 15;
    if (candidate.stop && typeof candidate.stop === 'number') score += 15;
    if (candidate.targets && Array.isArray(candidate.targets)) score += 10;
    
    // Prefer shorter, more focused responses
    if (response.length < 500) score += 10;
    if (response.length < 300) score += 5;
    
    return score;
  }

  private selectBestCandidate(candidates: any[], symbol: string, marketData: any): any {
    // Filter valid candidates and sort by score
    const validCandidates = candidates
      .filter(c => c && c._score > 50) // Minimum quality threshold
      .sort((a, b) => b._score - a._score);
    
    if (validCandidates.length > 0) {
      console.log(`✅ Selected best candidate with score ${validCandidates[0]._score}`);
      const { _score, _length, ...cleanCandidate } = validCandidates[0];
      return cleanCandidate;
    }
    
    // Fallback to first candidate if available
    if (candidates.length > 0) {
      const { _score, _length, ...cleanCandidate } = candidates[0];
      return cleanCandidate;
    }
    
    return null;
  }

  private applySanityChecks(decision: any, marketData: any): any {
    const price = marketData.price || 50000;
    
    // Sanity check: Long position price logic
    if (decision.position === 'long') {
      if (decision.stop && decision.stop >= decision.entry) {
        console.log(`🔧 Fixing LONG: stop loss (${decision.stop}) >= entry (${decision.entry})`);
        decision.stop = decision.entry * 0.95; // 5% below entry
      }
      if (decision.targets && decision.targets[0]?.price <= decision.entry) {
        console.log(`🔧 Fixing LONG: target (${decision.targets[0].price}) <= entry (${decision.entry})`);
        decision.targets[0].price = decision.entry * 1.1; // 10% above entry
      }
    }
    
    // Sanity check: Short position price logic
    if (decision.position === 'short') {
      if (decision.stop && decision.stop <= decision.entry) {
        console.log(`🔧 Fixing SHORT: stop loss (${decision.stop}) <= entry (${decision.entry})`);
        decision.stop = decision.entry * 1.05; // 5% above entry
      }
      if (decision.targets && decision.targets[0]?.price >= decision.entry) {
        console.log(`🔧 Fixing SHORT: target (${decision.targets[0].price}) >= entry (${decision.entry})`);
        decision.targets[0].price = decision.entry * 0.9; // 10% below entry
      }
    }
    
    // Ensure reasonable prices relative to current market
    if (Math.abs(decision.entry - price) / price > 0.1) { // Entry more than 10% away
      console.log(`🔧 Entry price too far from current price, adjusting`);
      decision.entry = price * (decision.position === 'long' ? 0.998 : 1.002);
    }
    
    return decision;
  }

  private extractConsensusFactors(responses: QuestionResponse[]): string[] {
    const allInsights = responses.flatMap(r => r.keyInsights);
    const factors: string[] = [];
    
    // Look for recurring themes
    const themes = ['trend', 'support', 'resistance', 'momentum', 'volume', 'rsi', 'breakout', 'reversal'];
    
    for (const theme of themes) {
      const mentions = allInsights.filter(insight => 
        insight.toLowerCase().includes(theme)
      ).length;
      
      if (mentions >= 1) { // Reduced threshold for streamlined questions
        factors.push(`${theme} signal`);
      }
    }
    
    return factors;
  }
}

// Export singleton instance
export const iterativeAnalyzer = new IterativeAnalyzer();