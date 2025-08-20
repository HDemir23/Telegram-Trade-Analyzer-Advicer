// Stage-D Deep Analysis with timeouts and retry logic - V3
// Fixes timeouts and empty responses with proper caps and retry

const REQ_TIMEOUT_MS = 10000; // 10 second timeout
const MAX_OUTPUT_TOKENS = 800; // Increased for GPT-5-mini reasoning

export interface StageDConfig {
  temperature: number;
  top_p: number;
  max_output_tokens: number;
  timeout_ms: number;
}

export const STAGE_D_CONFIG: StageDConfig = {
  temperature: 0.1,
  top_p: 0.9,
  max_output_tokens: MAX_OUTPUT_TOKENS,
  timeout_ms: REQ_TIMEOUT_MS
};

// V3 Stage-D System Prompt
export const STAGE_D_SYSTEM_PROMPT = `You are AI Quant Strategist. Output Decision JSON exactly. If RR ≥ min_rr not feasible or inputs stale, set position:"hold" and explain briefly. No extra keys.`;

// Timeout wrapper
export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('The operation was aborted due to timeout')), timeoutMs)
    )
  ]);
}

// Enhanced call with retry logic
export async function callDecisionLLM(
  systemPrompt: string, 
  userPrompt: string, 
  model: string = 'openai/gpt-5-mini'
): Promise<any> {
  const config = STAGE_D_CONFIG;
  
  try {
    // First attempt
    return await withTimeout(
      callOpenRouterWithConfig(systemPrompt, userPrompt, model, config),
      config.timeout_ms
    );
  } catch (error) {
    console.log(`⚠️ Stage-D first attempt failed: ${error}. Retrying with stricter prompt...`);
    
    // One tight retry with reminder
    const stricterUserPrompt = userPrompt + "\n\nReminder: Return only the Decision JSON matching the contract. Unknown keys will be rejected.";
    
    try {
      return await withTimeout(
        callOpenRouterWithConfig(systemPrompt, stricterUserPrompt, model, config),
        config.timeout_ms
      );
    } catch (retryError) {
      console.log(`❌ Stage-D retry failed: ${retryError}. Using fallback.`);
      throw retryError;
    }
  }
}

// OpenRouter call with specific config
async function callOpenRouterWithConfig(
  systemPrompt: string,
  userPrompt: string,
  model: string,
  config: StageDConfig
): Promise<any> {
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
      'X-Title': 'AI Trading Bot V3'
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: config.temperature,
      top_p: config.top_p,
      max_tokens: config.max_output_tokens,
      stop: ['```', '\n\n', 'ranking', 'assets'],
      reasoning: {
        effort: "high",   // High effort for best analysis
        exclude: true,    // Exclude reasoning tokens to save space for JSON
        enabled: true
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }

  const data = await response.json() as any;
  
  // Enhanced debugging
  console.log(`🔍 Stage-D API Response:`, {
    status: response.status,
    choices: data.choices?.length || 0,
    usage: data.usage,
    error: data.error,
    model: model,
    content_length: data.choices?.[0]?.message?.content?.length || 0
  });

  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    console.log(`❌ Empty content response:`, JSON.stringify(data, null, 2));
    throw new Error(`Empty response from AI model. Response: ${JSON.stringify(data)}`);
  }

  return JSON.parse(content);
}