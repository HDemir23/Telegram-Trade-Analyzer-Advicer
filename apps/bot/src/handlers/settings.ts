// User settings and preferences for Telegram Bot
import { MyContext } from '../core/types';

interface UserSettings {
  defaultModel?: 'claude' | 'gpt4o' | 'gpt4mini';
  defaultFormat?: 'full' | 'compact' | 'quick';
  riskTolerance?: 'conservative' | 'moderate' | 'aggressive';
  notifications?: boolean;
  timezone?: string;
  preferredMarkets?: string[];
  confidenceThreshold?: number;
}

// In-memory storage (replace with Redis/database in production)
const userSettings = new Map<number, UserSettings>();

export async function handleSettingsCommand(ctx: MyContext, args: string) {
  const userId = ctx.from!.id;
  const currentSettings = userSettings.get(userId) || {};
  
  if (!args.trim()) {
    await showCurrentSettings(ctx, currentSettings);
    return;
  }
  
  try {
    const updates = parseSettingsArgs(args);
    const newSettings = { ...currentSettings, ...updates };
    userSettings.set(userId, newSettings);
    
    await ctx.reply('✅ **Settings Updated**\n\n' + formatSettings(newSettings), {
      parse_mode: 'Markdown'
    });
    
  } catch (error: any) {
    await ctx.reply(`❌ Invalid settings format: ${error.message}\n\n` +
      'Use `/settings help` for examples.', {
      parse_mode: 'Markdown'
    });
  }
}

async function showCurrentSettings(ctx: MyContext, settings: UserSettings) {
  const settingsText = `⚙️ **Your Settings**\n\n${formatSettings(settings)}\n\n` +
    `**Change Settings:**\n` +
    `\`/settings model=gpt4mini\`\n` +
    `\`/settings format=quick\`\n` +
    `\`/settings risk=moderate\`\n` +
    `\`/settings threshold=65\`\n\n` +
    `**Quick Presets:**\n` +
    `\`/settings preset=daytrader\` - Fast analysis\n` +
    `\`/settings preset=swingtrader\` - Detailed analysis\n` +
    `\`/settings preset=investor\` - Conservative settings\n\n` +
    `Use \`/settings help\` for all options.`;
  
  const keyboard = {
    inline_keyboard: [
      [
        { text: '🏃 Day Trader', callback_data: 'settings_preset_daytrader' },
        { text: '📈 Swing Trader', callback_data: 'settings_preset_swingtrader' }
      ],
      [
        { text: '💎 Investor', callback_data: 'settings_preset_investor' },
        { text: '🔄 Reset', callback_data: 'settings_reset' }
      ]
    ]
  };
  
  await ctx.reply(settingsText, {
    parse_mode: 'Markdown',
    reply_markup: keyboard
  });
}

function formatSettings(settings: UserSettings): string {
  const defaults = {
    defaultModel: 'claude',
    defaultFormat: 'full',
    riskTolerance: 'moderate',
    notifications: true,
    timezone: 'UTC',
    preferredMarkets: ['crypto', 'stocks'],
    confidenceThreshold: 60
  };
  
  const current = { ...defaults, ...settings };
  
  return `🤖 **Model:** ${getModelName(current.defaultModel)}\n` +
         `📊 **Format:** ${current.defaultFormat}\n` +
         `🎯 **Risk:** ${current.riskTolerance}\n` +
         `🔔 **Notifications:** ${current.notifications ? 'On' : 'Off'}\n` +
         `⏰ **Timezone:** ${current.timezone}\n` +
         `📈 **Markets:** ${current.preferredMarkets.join(', ')}\n` +
         `🎲 **Min Confidence:** ${current.confidenceThreshold}%`;
}

function getModelName(model: string): string {
  switch (model) {
    case 'claude': return 'Claude 3.5 Sonnet';
    case 'gpt4o': return 'GPT-4o';
    case 'gpt4mini': return 'GPT-4o-mini';
    default: return 'Claude 3.5 Sonnet';
  }
}

function parseSettingsArgs(args: string): Partial<UserSettings> {
  const updates: Partial<UserSettings> = {};
  const pairs = args.split(/\s+/);
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (!key || !value) continue;
    
    switch (key.toLowerCase()) {
      case 'model':
      case 'm':
        if (!['claude', 'gpt4o', 'gpt4mini'].includes(value)) {
          throw new Error('Model must be: claude, gpt4o, or gpt4mini');
        }
        updates.defaultModel = value as any;
        break;
        
      case 'format':
      case 'f':
        if (!['full', 'compact', 'quick'].includes(value)) {
          throw new Error('Format must be: full, compact, or quick');
        }
        updates.defaultFormat = value as any;
        break;
        
      case 'risk':
      case 'r':
        if (!['conservative', 'moderate', 'aggressive'].includes(value)) {
          throw new Error('Risk must be: conservative, moderate, or aggressive');
        }
        updates.riskTolerance = value as any;
        break;
        
      case 'notifications':
      case 'notify':
        updates.notifications = ['true', 'on', 'yes', '1'].includes(value.toLowerCase());
        break;
        
      case 'timezone':
      case 'tz':
        updates.timezone = value;
        break;
        
      case 'threshold':
      case 't':
        const threshold = parseInt(value);
        if (isNaN(threshold) || threshold < 0 || threshold > 100) {
          throw new Error('Threshold must be a number between 0-100');
        }
        updates.confidenceThreshold = threshold;
        break;
        
      case 'markets':
        updates.preferredMarkets = value.split(',').map(m => m.trim().toLowerCase());
        break;
        
      case 'preset':
        return applyPreset(value);
        
      default:
        throw new Error(`Unknown setting: ${key}`);
    }
  }
  
  return updates;
}

function applyPreset(preset: string): Partial<UserSettings> {
  switch (preset.toLowerCase()) {
    case 'daytrader':
    case 'day':
      return {
        defaultModel: 'gpt4mini',
        defaultFormat: 'quick',
        riskTolerance: 'aggressive',
        confidenceThreshold: 55,
        preferredMarkets: ['crypto'],
        notifications: true
      };
      
    case 'swingtrader':
    case 'swing':
      return {
        defaultModel: 'claude',
        defaultFormat: 'compact',
        riskTolerance: 'moderate',
        confidenceThreshold: 65,
        preferredMarkets: ['crypto', 'stocks'],
        notifications: true
      };
      
    case 'investor':
    case 'invest':
      return {
        defaultModel: 'gpt4o',
        defaultFormat: 'full',
        riskTolerance: 'conservative',
        confidenceThreshold: 75,
        preferredMarkets: ['stocks'],
        notifications: false
      };
      
    default:
      throw new Error('Unknown preset. Available: daytrader, swingtrader, investor');
  }
}

export async function handleSettingsHelp(ctx: MyContext) {
  const helpText = `⚙️ **Settings Help**

**Available Settings:**
• \`model\` - AI model (claude/gpt4o/gpt4mini)
• \`format\` - Output format (full/compact/quick)
• \`risk\` - Risk tolerance (conservative/moderate/aggressive)
• \`threshold\` - Min confidence % (0-100)
• \`notifications\` - Alerts (true/false)
• \`timezone\` - Your timezone (UTC/EST/PST/etc)
• \`markets\` - Preferred markets (crypto,stocks,forex)

**Examples:**
\`/settings model=gpt4mini format=quick\`
\`/settings risk=aggressive threshold=50\`
\`/settings notifications=false timezone=EST\`
\`/settings markets=crypto,stocks\`

**Presets:**
\`/settings preset=daytrader\` 
├ Model: GPT-4o-mini (fast)
├ Format: Quick
├ Risk: Aggressive  
└ Threshold: 55%

\`/settings preset=swingtrader\`
├ Model: Claude (balanced)
├ Format: Compact
├ Risk: Moderate
└ Threshold: 65%

\`/settings preset=investor\`
├ Model: GPT-4o (detailed)
├ Format: Full
├ Risk: Conservative
└ Threshold: 75%

**Reset:** \`/settings reset\``;

  await ctx.reply(helpText, { parse_mode: 'Markdown' });
}

// Callback handler for settings buttons
export async function handleSettingsCallback(ctx: MyContext, data: string) {
  const userId = ctx.from!.id;
  const action = data.replace('settings_', '');
  
  try {
    if (action === 'reset') {
      userSettings.delete(userId);
      await ctx.editMessageText('✅ **Settings Reset**\n\nAll settings restored to defaults.', {
        parse_mode: 'Markdown'
      });
    } else if (action.startsWith('preset_')) {
      const preset = action.replace('preset_', '');
      const presetSettings = applyPreset(preset);
      const currentSettings = userSettings.get(userId) || {};
      const newSettings = { ...currentSettings, ...presetSettings };
      userSettings.set(userId, newSettings);
      
      await ctx.editMessageText('✅ **Preset Applied**\n\n' + formatSettings(newSettings), {
        parse_mode: 'Markdown'
      });
    }
    
    await ctx.answerCallbackQuery();
    
  } catch (error: any) {
    await ctx.answerCallbackQuery(`❌ ${error.message}`);
  }
}

// Get user settings utility
export function getUserSettings(userId: number): UserSettings {
  return userSettings.get(userId) || {
    defaultModel: 'claude',
    defaultFormat: 'full',
    riskTolerance: 'moderate',
    notifications: true,
    timezone: 'UTC',
    preferredMarkets: ['crypto', 'stocks'],
    confidenceThreshold: 60
  };
}

// Export settings for use in other commands
export { userSettings };