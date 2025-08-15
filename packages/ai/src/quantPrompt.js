"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateQuantPrompt = generateQuantPrompt;
const zod_1 = require("zod");
const quant_1 = require("./prompts/quant");
const schema_1 = require("./schema");
// Define the input schema for the analysis request
const analysisRequestSchema = zod_1.z.object({
    symbol: zod_1.z.string(),
    timeframe: zod_1.z.string(),
    min_rr: zod_1.z.number().positive(),
    leverage_cap: zod_1.z.number().positive(),
    data_staleness_sec: zod_1.z.number().int().positive(),
    features: zod_1.z.object({
        candles: zod_1.z.string().describe('OHLCV data as a string'),
        liquidity: zod_1.z.any().optional(),
        onchain: zod_1.z.any().optional(),
        sentiment: zod_1.z.any().optional(),
    }),
});
function selectAIProvider(model) {
    if (model.startsWith('gpt')) {
        return { name: 'OpenAI', apiKey: process.env.OPENAI_API_KEY || '' };
    }
    else if (model.startsWith('claude')) {
        return { name: 'Anthropic', apiKey: process.env.ANTHROPIC_API_KEY || '' };
    }
    else {
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
async function generateQuantPrompt(analysisRequest, model) {
    // Validate the input analysis request
    analysisRequestSchema.parse(analysisRequest);
    const provider = selectAIProvider(model);
    const maxTokens = 4096; // Default max tokens
    // Interpolate the analysis request into the prompt template
    const content = quant_1.promptTemplate
        .replace('${JSON.stringify(analysisRequest)}', JSON.stringify(analysisRequest, null, 2))
        .replace('${minRR}', String(analysisRequest.min_rr))
        .replace('${staleness}', String(analysisRequest.data_staleness_sec))
        .replace('${leverageCap}', String(analysisRequest.leverage_cap));
    const requestBody = {
        model,
        messages: [
            { role: 'system', content: quant_1.systemRole },
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
            throw new Error(`AI provider error (${response.status}): ${JSON.stringify(errorData)}`);
        }
        const data = (await response.json());
        const parsedResponse = JSON.parse(data.choices[0].message.content);
        // Validate the response against the schema
        return schema_1.aiOutputSchema.parse(parsedResponse);
    }
    catch (error) {
        console.error('Error generating quant prompt:', error);
        throw error;
    }
}
//# sourceMappingURL=quantPrompt.js.map