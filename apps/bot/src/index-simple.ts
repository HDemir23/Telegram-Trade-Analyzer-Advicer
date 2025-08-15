import { Bot } from 'grammy';

// Simple version for testing
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN || '');

bot.command('start', async (ctx) => {
  await ctx.reply('🤖 **AI Trading Bot is Online!**\n\nBot is working correctly! 🎉', {
    parse_mode: 'Markdown'
  });
});

bot.command('help', async (ctx) => {
  await ctx.reply('📚 **Available Commands:**\n\n/start - Test bot\n/help - This message\n/status - Bot status', {
    parse_mode: 'Markdown'
  });
});

bot.command('status', async (ctx) => {
  await ctx.reply(`✅ **Bot Status: Online**\n\n🕐 Uptime: ${process.uptime()}s\n📊 Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB\n🆔 Bot ID: ${ctx.me.id}`, {
    parse_mode: 'Markdown'
  });
});

// Handle unknown commands
bot.on('message', async (ctx) => {
  if (ctx.message?.text?.startsWith('/')) {
    await ctx.reply('❓ Unknown command. Use /help to see available commands.');
  } else {
    await ctx.reply('👋 Hello! I\'m your AI Trading Bot. Use /help to see what I can do!');
  }
});

// Error handling
bot.catch(console.error);

// Start the bot
console.log('🚀 Starting simple bot...');
bot.start().then(() => {
  console.log('✅ Bot started successfully!');
}).catch(console.error);