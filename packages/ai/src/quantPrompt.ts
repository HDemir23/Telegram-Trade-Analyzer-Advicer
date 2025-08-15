import { z } from 'zod';
import { systemRole, promptTemplate } from './prompts/quant';
import { aiOutputSchema } from './schema';

// Define the input schema for the analysis request
const analysisRequestSchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  min_rr: z.number().positive(),
  leverage_cap: z.number().positive(),
  data_staleness_sec: z.number().int().positive(),
  features: z.object({
    candles: z.string().describe('OHLCV data as a string'),
    liquidity: z.any().optional(),
    onchain: z.any().optional(),
    sentiment: z.any().optional(),
  }),
});

type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

// Define a type for AI provider configuration
type AIProviderConfig = {
  name: 'OpenRouter' | 'OpenAI' | 'Anthropic';
  apiKey: string;
  baseUrl?: string;
};

// Define the expected structure of the AI response
interface AIResponse {
  choices: {
    message: {
      content: string;
    };
  }[];
}

function selectAIProvider(model: string): AIProviderConfig {
  if (model.startsWith('gpt')) {
    return { name: 'OpenAI', apiKey: process.env.OPENAI_API_KEY || '' };
  } else if (model.startsWith('claude')) {
    return { name: 'Anthropic', apiKey: process.env.ANTHROPIC_API_KEY || '' };
  } else {
    return {
      name: 'OpenRouter',
      apiKey: process.env.OPENROUTER_API_KEY || '',
      baseUrl: 'https://openrouter.ai/api/v1',
    };
  }
}

/**
 * Generates a JSON-only prompt for the AI Quant Strategist.
 * @param analysisRequest The analysis request object.
 * @param model The AI model to use (e.g., 'gpt-4o', 'claude-3-opus-20240229').
 * @returns The parsed JSON response from the AI.
 */
export async function generateQuantPrompt(
  analysisRequest: AnalysisRequest,
  model: string
): Promise<z.infer<typeof aiOutputSchema>> {
  // Validate the input analysis request
  analysisRequestSchema.parse(analysisRequest);

  const provider = selectAIProvider(model);
  const maxTokens = 4096; // Default max tokens

  // Interpolate the analysis request into the prompt template
  const content = promptTemplate
    .replace('${JSON.stringify(analysisRequest)}', JSON.stringify(analysisRequest, null, 2))
    .replace('${minRR}', String(analysisRequest.min_rr))
    .replace('${staleness}', String(analysisRequest.data_staleness_sec))
    .replace('${leverageCap}', String(analysisRequest.leverage_cap));

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: systemRole },
      { role: 'user', content },
    ],
    temperature: 0.4,
    max_tokens: maxTokens,
    response_format: { type: 'json_object' },
  };

  try {
    const response = await fetch(`${provider.baseUrl || 'https://api.openai.com/v1'}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${provider.apiKey}`,
        ...(provider.name === 'OpenRouter' && { 'X-Title': 'AI Trading Bot' }),
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(
        `AI provider error (${response.status}): ${JSON.stringify(errorData)}`
      );
    }

    const data = (await response.json()) as AIResponse;
    const parsedResponse = JSON.parse(data.choices[0].message.content);

    // Validate the response against the schema
    return aiOutputSchema.parse(parsedResponse);
  } catch (error) {
    console.error('Error generating quant prompt:', error);
    throw error;
  }
}