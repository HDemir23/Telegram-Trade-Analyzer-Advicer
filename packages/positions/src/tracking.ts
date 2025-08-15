// Remove import since it causes circular dependency issues during build

export interface ActivePosition {
  id: string;
  userId: number;
  chatId: number;
  symbol: string;
  market: string;
  plan: any; // Will be AiOutput type
  openedAt: Date;
  lastUpdate: Date;
  status: 'active' | 'closed' | 'stopped';
  actualEntry?: number;
  currentPrice?: number;
  pnl?: number;
  notes?: string;
}

export interface PositionUpdate {
  positionId: string;
  currentPrice: number;
  pnl: number;
  recommendation: 'hold' | 'close' | 'partial_close' | 'move_sl';
  reasoning: string;
  keyLevels: {
    nextSupport: number;
    nextResistance: number;
  };
  riskWarning?: string;
}

class PositionTracker {
  private positions = new Map<string, ActivePosition>();
  private updateIntervals = new Map<string, NodeJS.Timeout>();

  addPosition(position: ActivePosition): void {
    this.positions.set(position.id, position);
    this.startTracking(position.id);
  }

  removePosition(positionId: string): void {
    this.positions.delete(positionId);
    const interval = this.updateIntervals.get(positionId);
    if (interval) {
      clearInterval(interval);
      this.updateIntervals.delete(positionId);
    }
  }

  getPosition(positionId: string): ActivePosition | undefined {
    return this.positions.get(positionId);
  }

  getUserPositions(userId: number): ActivePosition[] {
    return Array.from(this.positions.values()).filter(p => p.userId === userId);
  }

  private startTracking(positionId: string): void {
    // Update every 6 hours (6 * 60 * 60 * 1000 ms)
    const interval = setInterval(async () => {
      await this.updatePosition(positionId);
    }, 6 * 60 * 60 * 1000);
    
    this.updateIntervals.set(positionId, interval);
  }

  private async updatePosition(positionId: string): Promise<void> {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'active') {
      this.removePosition(positionId);
      return;
    }

    try {
      // Get current price (mock for now)
      const currentPrice = await this.getCurrentPrice(position.symbol);
      
      // Calculate P&L
      const entryPrice = position.actualEntry || position.plan.entry.price;
      const pnl = position.plan.position === 'long' 
        ? ((currentPrice - entryPrice) / entryPrice) * 100
        : ((entryPrice - currentPrice) / entryPrice) * 100;

      // Get AI analysis
      const update = await this.getAIPositionUpdate(position, currentPrice, pnl);
      
      // Update position
      position.lastUpdate = new Date();
      position.currentPrice = currentPrice;
      position.pnl = pnl;
      
      // Send update to user
      await this.sendPositionUpdate(position, update);
      
    } catch (error) {
      console.error(`Error updating position ${positionId}:`, error);
    }
  }

  private async getCurrentPrice(symbol: string): Promise<number> {
    // Mock price - replace with real market data
    return 100 + Math.random() * 50;
  }

  private async getAIPositionUpdate(
    position: ActivePosition, 
    currentPrice: number, 
    pnl: number
  ): Promise<PositionUpdate> {
    const systemPrompt = `You are an AI Position Manager. Analyze the current position status and provide trading recommendations. Return only JSON.`;
    
    const userPrompt = `
Current Position:
- Symbol: ${position.symbol}
- Entry: ${position.plan.entry.price}
- Stop Loss: ${position.plan.stop_loss}
- Take Profit: ${position.plan.take_profits.map((tp: any) => tp.price).join(', ')}
- Current Price: ${currentPrice}
- P&L: ${pnl.toFixed(2)}%
- Position: ${position.plan.position}

Return JSON with: recommendation, reasoning, keyLevels{nextSupport, nextResistance}, riskWarning?`;

    try {
      const aiResponse = await this.callPositionAI(systemPrompt, userPrompt);
      return {
        positionId: position.id,
        currentPrice,
        pnl,
        ...aiResponse
      };
    } catch (error) {
      // Fallback logic
      return {
        positionId: position.id,
        currentPrice,
        pnl,
        recommendation: pnl > 10 ? 'partial_close' : pnl < -5 ? 'close' : 'hold',
        reasoning: 'Automated recommendation based on P&L thresholds',
        keyLevels: {
          nextSupport: currentPrice * 0.95,
          nextResistance: currentPrice * 1.05
        }
      };
    }
  }

  private async callPositionAI(systemPrompt: string, userPrompt: string): Promise<any> {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;

    const response = await globalThis.fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'AI Trading Bot - Position Monitor'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) throw new Error('AI call failed');
    
    const data = await response.json() as any;
    return JSON.parse(data.choices[0].message.content);
  }

  private async sendPositionUpdate(position: ActivePosition, update: PositionUpdate): Promise<void> {
    try {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      if (!botToken) return;

      const pnlEmoji = update.pnl > 0 ? '📈' : update.pnl < 0 ? '📉' : '⚖️';
      const statusEmoji = update.recommendation === 'hold' ? '🟡' : 
                         update.recommendation === 'close' ? '🔴' : 
                         update.recommendation === 'partial_close' ? '🟠' : '🔵';

      const message = `
🤖 **Position Update** ${statusEmoji}

📊 **${position.symbol}**
💰 Current Price: $${update.currentPrice.toFixed(2)}
${pnlEmoji} P&L: ${update.pnl > 0 ? '+' : ''}${update.pnl.toFixed(2)}%

🔍 **AI Analysis:**
${update.reasoning}

📊 **Recommendation:** ${update.recommendation.toUpperCase().replace('_', ' ')}

🎯 **Key Levels:**
• Support: $${update.keyLevels.nextSupport.toFixed(2)}
• Resistance: $${update.keyLevels.nextResistance.toFixed(2)}

${update.riskWarning ? `⚠️ **Risk Warning:** ${update.riskWarning}` : ''}

Position ID: \`${position.id}\`
Last Update: ${new Date().toLocaleString()}
      `.trim();

      await globalThis.fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: position.chatId,
          text: message,
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [[
              { text: '📊 Full Analysis', callback_data: `analysis_${position.id}` },
              { text: '❌ Close Position', callback_data: `close_position_${position.id}` }
            ]]
          }
        })
      });

    } catch (error) {
      console.error('Error sending position update:', error);
    }
  }
}

export const positionTracker = new PositionTracker();