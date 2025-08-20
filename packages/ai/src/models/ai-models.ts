// AI Model Configuration and Selection System

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  endpoint: string;
  pricing: 'free' | 'cheap' | 'premium';
  speed: 'very_fast' | 'fast' | 'medium' | 'slow';
  quality: 'basic' | 'good' | 'excellent' | 'premium';
  contextLimit: number;
  maxTokens: number;
  temperature: number;
  bestFor: string[];
  description: string;
}

export const AI_MODELS: Record<string, AIModel> = {
  // OpenAI Models
  'gpt-5-mini': {
    id: 'openai/gpt-5-mini',
    name: 'GPT-5 Mini',
    provider: 'OpenAI',
    endpoint: 'openai/gpt-5-mini',
    pricing: 'cheap',
    speed: 'very_fast',
    quality: 'excellent',
    contextLimit: 128000,
    maxTokens: 8000, // Increased to 8000 to handle high-effort reasoning + JSON response
    temperature: 0.05, // Ultra-low for consistent, structured responses
    bestFor: ['quick_analysis', 'screening', 'day_trading'],
    description: 'Latest GPT-5 Mini - Ultra-fast with excellent reasoning'
  },
  'gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'OpenAI', 
    endpoint: 'openai/gpt-4o-mini',
    pricing: 'cheap',
    speed: 'very_fast',
    quality: 'good',
    contextLimit: 128000,
    maxTokens: 400,
    temperature: 0.1,
    bestFor: ['quick_analysis', 'screening'],
    description: 'Fast and efficient for rapid trading decisions'
  },
  'gpt-4o': {
    id: 'openai/gpt-4o',
    name: 'GPT-4o',
    provider: 'OpenAI',
    endpoint: 'openai/gpt-4o',
    pricing: 'premium',
    speed: 'medium',
    quality: 'premium',
    contextLimit: 128000,
    maxTokens: 450,
    temperature: 0.1,
    bestFor: ['deep_analysis', 'portfolio_management'],
    description: 'Premium analysis with advanced reasoning'
  },

  // Anthropic Models
  'claude-3.5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    endpoint: 'anthropic/claude-3.5-sonnet',
    pricing: 'premium',
    speed: 'fast',
    quality: 'premium',
    contextLimit: 200000,
    maxTokens: 450,
    temperature: 0.15,
    bestFor: ['balanced_analysis', 'risk_management'],
    description: 'Balanced analysis with excellent risk awareness'
  },

  // Meta Models
  'llama-3.1-8b': {
    id: 'meta-llama/llama-3.1-8b-instruct:free',
    name: 'Llama 3.1 8B',
    provider: 'Meta',
    endpoint: 'meta-llama/llama-3.1-8b-instruct:free',
    pricing: 'free',
    speed: 'fast',
    quality: 'good',
    contextLimit: 128000,
    maxTokens: 400,
    temperature: 0.2,
    bestFor: ['testing', 'basic_analysis'],
    description: 'Free model for testing and basic analysis'
  }
};

// Model Selection Logic
export class ModelSelector {
  static getModelForTask(task: 'quick' | 'deep' | 'portfolio' | 'screening'): AIModel {
    switch (task) {
      case 'quick':
        return AI_MODELS['gpt-5-mini'] || AI_MODELS['gpt-4o-mini'];
      case 'deep':
        return AI_MODELS['gpt-5-mini'] || AI_MODELS['gpt-4o'];
      case 'portfolio':
        return AI_MODELS['gpt-5-mini'] || AI_MODELS['gpt-4o'];
      case 'screening':
        return AI_MODELS['gpt-5-mini'] || AI_MODELS['gpt-4o-mini'];
      default:
        return AI_MODELS['gpt-5-mini'];
    }
  }

  static getModelByName(name: string): AIModel | null {
    return AI_MODELS[name] || null;
  }

  static getAllModels(): AIModel[] {
    return Object.values(AI_MODELS);
  }

  static getModelsByCategory(category: 'free' | 'cheap' | 'premium'): AIModel[] {
    return Object.values(AI_MODELS).filter(model => model.pricing === category);
  }

  static getBestModelForSpeed(): AIModel {
    return Object.values(AI_MODELS)
      .filter(model => model.speed === 'very_fast')
      .sort((a, b) => {
        const qualityOrder = { 'basic': 1, 'good': 2, 'excellent': 3, 'premium': 4 };
        return qualityOrder[b.quality] - qualityOrder[a.quality];
      })[0] || AI_MODELS['gpt-4o-mini'];
  }

  static getBestModelForQuality(): AIModel {
    return Object.values(AI_MODELS)
      .filter(model => model.quality === 'premium')
      .sort((a, b) => {
        const speedOrder = { 'slow': 1, 'medium': 2, 'fast': 3, 'very_fast': 4 };
        return speedOrder[b.speed] - speedOrder[a.speed];
      })[0] || AI_MODELS['gpt-5-mini'];
  }
}

// Legacy model name mapping for backward compatibility
export function getModelName(shortName: string): string {
  const mapping: Record<string, string> = {
    'claude': process.env.AI_MODEL || 'openai/gpt-5-mini',
    'gpt4o': 'openai/gpt-4o',
    'gpt4mini': 'openai/gpt-4o-mini',
    'gpt5mini': 'openai/gpt-5-mini',
    'llama': 'meta-llama/llama-3.1-8b-instruct:free'
  };
  
  return mapping[shortName] || shortName;
}

// Model configuration for API calls
export function getModelConfig(modelId: string) {
  const model = ModelSelector.getModelByName(modelId) || AI_MODELS['gpt-5-mini'];
  
  const config: any = {
    model: model.endpoint,
    temperature: Math.min(0.15, model.temperature ?? 0.15),
    max_tokens: 1000,                       // increased for reasoning + response
    top_p: 0.9,
    frequency_penalty: 0.2,
    presence_penalty: 0.0,
    stop: ['```', '\n\n', 'Explanation:', 'Notes:', 'Rankings:', '---']
  };

  // Add structured output constraints for GPT-5-mini - FORCE CONSISTENCY
  if (model.id === 'openai/gpt-5-mini') {
    config.reasoning = {
      effort: "medium",    // MEDIUM EFFORT to reduce token consumption
      exclude: true,       // Exclude reasoning to preserve JSON response space
      enabled: true,
      max_reasoning_tokens: 800  // was 1500, now reduced for terse output
    };
    
    // IMPORTANT: avoid overly strict response_format unless it mirrors your Decision
    // Commented out to allow the model to output richer JSON matching full Decision schema
    // config.response_format = { type: 'json_object' };
  }
  
  return config;
}

// Debug information
export function getModelInfo(modelId: string): string {
  const model = ModelSelector.getModelByName(modelId);
  if (!model) return 'Unknown model';
  
  return `${model.name} (${model.provider}) - ${model.quality} quality, ${model.speed} speed, ${model.pricing} pricing`;
}