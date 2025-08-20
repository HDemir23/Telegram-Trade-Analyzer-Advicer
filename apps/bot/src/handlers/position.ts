import { Composer, InlineKeyboard } from 'grammy';
import { MyContext } from '../core/types';
// import { PositionService } from '@trade/positions';
// import { PositionParser } from '@trade/positions';  
// import { PositionFormatter } from '@trade/positions';
// import { PnLCalculator } from '@trade/positions';
// import { logger } from '@trade/logger';

// Temporarily use simple position parser for demo
class SimplePositionParser {
  static parse(input: string) {
    // Simple regex to parse: LONG BTCUSDT 0.5 @ 62850 SL 61200 TP 64500
    const pattern = /^(LONG|SHORT)\s+([A-Z0-9]+)\s+([\d.]+)\s*@\s*([\d.]+)(?:\s+SL\s+([\d.]+))?(?:\s+TP\s+([\d.,]+))?/i;
    const match = input.match(pattern);
    
    if (!match) {
      throw new Error('Invalid format. Use: LONG/SHORT SYMBOL QTY @ PRICE [SL price] [TP price1,price2]');
    }
    
    const [, side, symbol, qty, price, sl, tp] = match;
    return {
      side: side.toUpperCase(),
      symbol: symbol.toUpperCase(),
      quantity: parseFloat(qty),
      entryPrice: parseFloat(price),
      stopLoss: sl ? parseFloat(sl) : null,
      takeProfit: tp ? tp.split(',').map(p => parseFloat(p.trim())) : null
    };
  }
  
  static getExamples() {
    return [
      'LONG BTCUSDT 0.5 @ 62850 SL 61200 TP 64500,66000',
      'SHORT ETHUSDT 2.0 @ 3450 SL 3520 TP 3300',
      'LONG AAPL 100 @ 180.50 SL 175.00 TP 190.00'
    ];
  }
}

// Mock position service for demo
const mockPositions = new Map();

export const positionCommands = new Composer<MyContext>();

positionCommands.command('position', async (ctx) => {
  const args = ctx.message?.text?.split(' ').slice(1) || [];
  const subcommand = args[0];

  switch (subcommand) {
    case 'list':
      return handleListPositions(ctx);
    case 'parse':
      return handleParseCommand(ctx);
    case 'view':
      return handleViewPosition(ctx, args[1]);
    case 'close':
      return handleClosePosition(ctx);
    case 'scale':
      return handleScalePosition(ctx);
    default:
      return handlePositionMenu(ctx);
  }
});

async function handlePositionMenu(ctx: MyContext) {
  const keyboard = new InlineKeyboard()
    .text('📊 View Positions', 'position_list')
    .text('➕ Open Position', 'position_open').row()
    .text('📝 Parse Position', 'position_parse')
    .text('💰 PnL Summary', 'position_pnl').row()
    .text('📖 Help', 'position_help');

  const message = `
**📊 Position Management**

Choose an action:
• **View Positions** - See your open positions
• **Open Position** - Create a new position
• **Parse Position** - Quick entry from text
• **PnL Summary** - Portfolio overview
• **Help** - Position command examples

*Tip: You can also use direct commands like \`/position list\` or \`/position parse\`*
  `.trim();

  await ctx.reply(message, {
    reply_markup: keyboard,
    parse_mode: 'Markdown'
  });
}

async function handleListPositions(ctx: MyContext) {
  try {
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply('❌ User identification failed');
      return;
    }

    const userPositions = Array.from(mockPositions.values()).filter((p: any) => p.userId === userId);
    
    let message = '📊 **Your Positions**\n\n';
    
    if (userPositions.length === 0) {
      message += '📭 No positions found\n\nUse `/position parse` to add your first position!';
    } else {
      userPositions.forEach((pos: any, index: number) => {
        const pnlEmoji = pos.side === 'LONG' ? '📈' : '📉';
        message += `${pnlEmoji} **${pos.symbol}** ${pos.side}\n`;
        message += `• Entry: $${pos.entryPrice} | Qty: ${pos.quantity}\n`;
        if (pos.stopLoss) message += `• SL: $${pos.stopLoss}\n`;
        if (pos.takeProfit) message += `• TP: ${pos.takeProfit.join(', ')}\n`;
        message += `• Status: Active\n\n`;
      });
    }

    const keyboard = new InlineKeyboard()
      .text('➕ Parse Position', 'position_parse')
      .text('🔄 Refresh', 'position_list');

    await ctx.reply(message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('Error listing positions:', error);
    await ctx.reply('❌ Failed to retrieve positions. Please try again.');
  }
}

async function handleViewPosition(ctx: MyContext, positionId?: string) {
  if (!positionId) {
    await ctx.reply('❌ Please provide a position ID: `/position view <id>`', {
      parse_mode: 'Markdown'
    });
    return;
  }

  try {
    const position = mockPositions.get(positionId);
    if (!position) {
      await ctx.reply('❌ Position not found');
      return;
    }

    const userId = ctx.from?.id?.toString();
    if (position.userId !== userId) {
      await ctx.reply('❌ Access denied');
      return;
    }

    const message = `
**📊 Position Details**

**${position.side}** ${position.symbol}
• **Entry:** $${position.entryPrice}
• **Quantity:** ${position.quantity}
• **Stop Loss:** ${position.stopLoss ? `$${position.stopLoss}` : 'Not set'}
• **Take Profit:** ${position.takeProfit ? position.takeProfit.map((tp: number) => `$${tp}`).join(', ') : 'Not set'}
• **Created:** ${position.createdAt.toLocaleString()}

*Position ID: \`${positionId}\`*
    `.trim();

    const keyboard = new InlineKeyboard()
      .text('🔄 Refresh', `position_view_${positionId}`)
      .text('◀️ Back', 'position_list');

    await ctx.reply(message, {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    });

  } catch (error) {
    console.error('Error viewing position:', error);
    await ctx.reply('❌ Failed to load position details. Please try again.');
  }
}

async function handleParseCommand(ctx: MyContext) {
  const examples = SimplePositionParser.getExamples();
  
  const message = `
**📝 Parse Position from Text**

Send a message with your position details in this format:

\`LONG/SHORT SYMBOL QTY @ PRICE [SL price] [TP price1,price2]\`

**Examples:**
${examples.map(ex => `• \`${ex}\``).join('\n')}

Just send your position text and I'll parse and confirm it!
  `.trim();

  await ctx.reply(message, { parse_mode: 'Markdown' });
  
  ctx.session.awaitingPositionParse = true;
}

async function handleClosePosition(ctx: MyContext) {
  await ctx.reply('🔄 Close position feature implementation in progress...');
}

async function handleScalePosition(ctx: MyContext) {
  await ctx.reply('🔄 Scale position feature implementation in progress...');
}

positionCommands.callbackQuery(/^position_(.+)$/, async (ctx) => {
  const action = ctx.match[1];
  
  switch (action) {
    case 'list':
      await ctx.answerCallbackQuery();
      return handleListPositions(ctx);
    case 'open':
      await ctx.answerCallbackQuery();
      return handleOpenPositionWizard(ctx);
    case 'parse':
      await ctx.answerCallbackQuery();
      return handleParseCommand(ctx);
    case 'pnl':
      await ctx.answerCallbackQuery();
      return handlePnLSummary(ctx);
    case 'help':
      await ctx.answerCallbackQuery();
      return handlePositionHelp(ctx);
    default:
      await ctx.answerCallbackQuery('Unknown action');
  }
});

async function handleOpenPositionWizard(ctx: MyContext) {
  const keyboard = new InlineKeyboard()
    .text('📈 LONG', 'wizard_side_LONG')
    .text('📉 SHORT', 'wizard_side_SHORT').row()
    .text('◀️ Back', 'position_menu');

  await ctx.editMessageText(
    '**📊 Open New Position - Step 1/8**\n\nChoose position side:',
    {
      reply_markup: keyboard,
      parse_mode: 'Markdown'
    }
  );
}

async function handlePnLSummary(ctx: MyContext) {
  try {
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.reply('❌ User identification failed');
      return;
    }

    const userPositions = Array.from(mockPositions.values()).filter((p: any) => p.userId === userId);
    const openPositions = userPositions; // All positions are "open" in our mock

    const message = `
**💰 Portfolio PnL Summary**

**📊 Overall Performance:**
• Total Positions: ${userPositions.length}
• Unrealized: Tracking enabled
• Realized: Coming soon

**📈 Trading Stats:**
• Open Positions: ${openPositions.length}
• Closed Trades: 0 (demo mode)
• Win Rate: N/A (demo mode)

**🎯 Active Positions:**
${openPositions.length > 0 ? openPositions.map((p: any) => {
  const emoji = p.side === 'LONG' ? '📈' : '📉';
  return `${emoji} ${p.symbol} ${p.side}: Entry $${p.entryPrice}`;
}).join('\n') : 'No open positions'}

*Use /position list for detailed view*
    `.trim();

    await ctx.editMessageText(message, {
      parse_mode: 'Markdown',
      reply_markup: new InlineKeyboard()
        .text('📊 View Positions', 'position_list')
        .text('◀️ Back', 'position_menu')
    });

  } catch (error) {
    console.error('Error generating PnL summary:', error);
    await ctx.reply('❌ Failed to generate PnL summary. Please try again.');
  }
}

async function handlePositionHelp(ctx: MyContext) {
  const examples = SimplePositionParser.getExamples();
  
  const message = `
**📖 Position Management Help**

**Commands:**
• \`/position\` - Main position menu
• \`/position list\` - View all positions
• \`/position parse\` - Parse from text
• \`/position view <id>\` - View specific position

**Text Parsing Examples:**
${examples.map(ex => `• \`${ex}\``).join('\n')}

**Position Actions:**
• Scale In/Out - Adjust position size
• Adjust SL/TP - Modify risk levels
• Add Notes - Journal your trades
• Close - Partially or fully close

**Tips:**
• Use clear price levels for SL/TP
• Include exchange for tracking
• Add notes for strategy context
• Monitor R:R ratios (Risk:Reward)

Need help with a specific command? Just ask!
  `.trim();

  await ctx.editMessageText(message, {
    parse_mode: 'Markdown',
    reply_markup: new InlineKeyboard().text('◀️ Back', 'position_menu')
  });
}

positionCommands.on('message:text', async (ctx, next) => {
  if (ctx.session.awaitingPositionParse) {
    try {
      const text = ctx.message.text;
      
      if (text.toLowerCase().includes('close') || text.toLowerCase().includes('scale')) {
        await ctx.reply('🔄 Close and scale commands will be supported soon!');
        return;
      }

      const parsed = SimplePositionParser.parse(text);
      
      const confirmMessage = `
**📝 Parsed Position - Please Confirm**

**Side:** ${parsed.side}
**Symbol:** ${parsed.symbol}
**Quantity:** ${parsed.quantity}
**Entry Price:** $${parsed.entryPrice}
**Stop Loss:** ${parsed.stopLoss ? `$${parsed.stopLoss}` : 'Not set'}
**Take Profit:** ${parsed.takeProfit ? parsed.takeProfit.map(tp => `$${tp}`).join(', ') : 'Not set'}

Confirm to create this position?
      `.trim();

      const keyboard = new InlineKeyboard()
        .text('✅ Confirm', `confirm_position_${Buffer.from(JSON.stringify(parsed)).toString('base64')}`)
        .text('❌ Cancel', 'cancel_position');

      await ctx.reply(confirmMessage, {
        reply_markup: keyboard,
        parse_mode: 'Markdown'
      });

      ctx.session.awaitingPositionParse = false;

    } catch (error) {
      console.error('Position parsing error:', error);
      await ctx.reply(`❌ **Parsing Error**\n\n${error instanceof Error ? error.message : 'Invalid format'}\n\nPlease check the format and try again. Use /position parse for examples.`, {
        parse_mode: 'Markdown'
      });
    }
  } else {
    await next();
  }
});

positionCommands.callbackQuery(/^confirm_position_(.+)$/, async (ctx) => {
  try {
    const encodedData = ctx.match[1];
    const parsed = JSON.parse(Buffer.from(encodedData, 'base64').toString());
    
    const userId = ctx.from?.id?.toString();
    if (!userId) {
      await ctx.answerCallbackQuery('❌ User identification failed');
      return;
    }

    // Add position to mock storage
    const positionId = `pos_${Date.now()}`;
    const positionData = {
      id: positionId,
      userId,
      symbol: parsed.symbol,
      side: parsed.side,
      quantity: parsed.quantity,
      entryPrice: parsed.entryPrice,
      stopLoss: parsed.stopLoss,
      takeProfit: parsed.takeProfit,
      createdAt: new Date()
    };

    mockPositions.set(positionId, positionData);
    
    await ctx.answerCallbackQuery('✅ Position created!');
    await ctx.editMessageText(
      `✅ **Position Created Successfully!**\n\nPosition ID: \`${positionId}\`\n\nUse \`/position list\` to see all positions.`,
      { parse_mode: 'Markdown' }
    );

    console.log(`Position created: ${positionId} for user ${userId}`);

  } catch (error) {
    console.error('Error creating position:', error);
    await ctx.answerCallbackQuery('❌ Failed to create position');
    await ctx.editMessageText('❌ Failed to create position. Please try again.');
  }
});

positionCommands.callbackQuery('cancel_position', async (ctx) => {
  await ctx.answerCallbackQuery('❌ Position creation cancelled');
  await ctx.editMessageText('❌ Position creation cancelled.');
  ctx.session.awaitingPositionParse = false;
});