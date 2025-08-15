import { Position, PositionEvent, PositionMetric } from '@prisma/client';
import { PnLCalculation } from './pnl';

export class PositionFormatter {
  static formatPositionCard(
    position: Position & { 
      events: PositionEvent[]; 
      metrics?: PositionMetric | null 
    },
    pnl: PnLCalculation,
    currentPrice?: number
  ): string {
    const emoji = position.side === 'LONG' ? '📈' : '📉';
    const sideColor = position.side === 'LONG' ? '🟢' : '🔴';
    const pnlEmoji = pnl.totalPnl >= 0 ? '💰' : '📉';
    const statusEmoji = position.status === 'OPEN' ? '⚡' : '✅';

    let card = `${emoji} **Position #${position.id.slice(-6)}** ${statusEmoji}\n\n`;
    
    card += `${sideColor} **${position.side}** ${position.symbol}\n`;
    card += `📊 **Market:** ${position.market.toUpperCase()}\n`;
    
    if (position.exchange) {
      card += `🏢 **Exchange:** ${position.exchange}\n`;
    }
    
    card += `\n**📈 Position Details:**\n`;
    card += `• Entry: $${position.entryPrice.toFixed(4)}\n`;
    card += `• Quantity: ${pnl.currentQty.toFixed(6)} (Avg: $${pnl.avgEntryPrice.toFixed(4)})\n`;
    card += `• Notional: $${(pnl.currentQty * pnl.avgEntryPrice).toFixed(2)}\n`;
    
    if (position.leverage) {
      card += `• Leverage: ${position.leverage}x\n`;
    }

    if (currentPrice) {
      card += `• Current: $${currentPrice.toFixed(4)}\n`;
    }

    card += `\n**🎯 Risk Management:**\n`;
    if (position.stopLoss) {
      card += `• Stop Loss: $${position.stopLoss.toFixed(4)}\n`;
    }
    if (position.takeProfit1) {
      card += `• TP1: $${position.takeProfit1.toFixed(4)}\n`;
    }
    if (position.takeProfit2) {
      card += `• TP2: $${position.takeProfit2.toFixed(4)}\n`;
    }
    if (pnl.riskRewardRatio > 0) {
      card += `• R:R Ratio: 1:${pnl.riskRewardRatio.toFixed(2)}\n`;
    }

    card += `\n**💰 PnL Analysis:**\n`;
    card += `${pnlEmoji} **Total PnL:** $${pnl.totalPnl.toFixed(2)} (${pnl.totalPnlPct.toFixed(2)}%)\n`;
    
    if (position.status === 'OPEN') {
      card += `• Unrealized: $${pnl.unrealizedPnl.toFixed(2)} (${pnl.unrealizedPnlPct.toFixed(2)}%)\n`;
    }
    
    if (pnl.realizedPnl !== 0) {
      card += `• Realized: $${pnl.realizedPnl.toFixed(2)}\n`;
    }
    
    if (pnl.maxRunupPct > 0) {
      card += `• Max Runup: ${pnl.maxRunupPct.toFixed(2)}%\n`;
    }
    
    if (pnl.maxDrawdownPct > 0) {
      card += `• Max Drawdown: ${pnl.maxDrawdownPct.toFixed(2)}%\n`;
    }

    if (position.note) {
      card += `\n**📝 Note:** ${position.note}\n`;
    }

    const recentEvents = position.events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 3);

    if (recentEvents.length > 0) {
      card += `\n**📊 Recent Activity:**\n`;
      recentEvents.forEach(event => {
        const eventEmoji = this.getEventEmoji(event.kind);
        const timeAgo = this.formatTimeAgo(event.timestamp);
        card += `${eventEmoji} ${event.kind.replace('_', ' ')} ${timeAgo}\n`;
      });
    }

    card += `\n*Created: ${this.formatDate(position.createdAt)}*`;
    
    if (position.status === 'CLOSED' && position.closedAt) {
      card += ` | *Closed: ${this.formatDate(position.closedAt)}*`;
    }

    return card;
  }

  static formatPositionSummary(
    position: Position,
    pnl: PnLCalculation,
    currentPrice?: number
  ): string {
    const emoji = position.side === 'LONG' ? '📈' : '📉';
    const pnlEmoji = pnl.totalPnl >= 0 ? '🟢' : '🔴';
    const statusEmoji = position.status === 'OPEN' ? '⚡' : '✅';

    let summary = `${emoji} **${position.symbol}** ${position.side} ${statusEmoji}\n`;
    summary += `Entry: $${position.entryPrice.toFixed(4)}`;
    
    if (currentPrice) {
      summary += ` | Current: $${currentPrice.toFixed(4)}`;
    }
    
    summary += `\n${pnlEmoji} PnL: $${pnl.totalPnl.toFixed(2)} (${pnl.totalPnlPct.toFixed(2)}%)`;
    
    if (pnl.currentQty > 0) {
      summary += ` | Qty: ${pnl.currentQty.toFixed(6)}`;
    }

    return summary;
  }

  static formatPositionList(
    positions: (Position & { 
      events: PositionEvent[]; 
      metrics?: PositionMetric | null 
    })[],
    pnlCalculations: PnLCalculation[],
    currentPrices: Record<string, number> = {}
  ): string {
    if (positions.length === 0) {
      return '📭 **No positions found**\n\nUse `/position` to open your first position!';
    }

    let list = `📊 **Your Positions** (${positions.length})\n\n`;
    
    const openPositions = positions.filter(p => p.status === 'OPEN');
    const closedPositions = positions.filter(p => p.status === 'CLOSED');

    if (openPositions.length > 0) {
      list += `⚡ **Open Positions (${openPositions.length}):**\n`;
      openPositions.forEach((position, index) => {
        const pnl = pnlCalculations[positions.indexOf(position)];
        const currentPrice = currentPrices[position.symbol];
        list += `\n${this.formatPositionSummary(position, pnl, currentPrice)}\n`;
      });
    }

    if (closedPositions.length > 0) {
      list += `\n✅ **Recent Closed (${Math.min(closedPositions.length, 5)}):**\n`;
      closedPositions.slice(0, 5).forEach((position, index) => {
        const pnl = pnlCalculations[positions.indexOf(position)];
        list += `\n${this.formatPositionSummary(position, pnl)}\n`;
      });
    }

    const totalUnrealized = pnlCalculations
      .filter((_, i) => positions[i].status === 'OPEN')
      .reduce((sum, pnl) => sum + pnl.unrealizedPnl, 0);

    const totalRealized = pnlCalculations
      .reduce((sum, pnl) => sum + pnl.realizedPnl, 0);

    list += `\n**💰 Portfolio Summary:**\n`;
    list += `• Unrealized PnL: $${totalUnrealized.toFixed(2)}\n`;
    list += `• Realized PnL: $${totalRealized.toFixed(2)}\n`;
    list += `• **Total PnL: $${(totalUnrealized + totalRealized).toFixed(2)}**`;

    return list;
  }

  static formatEventLog(events: PositionEvent[]): string {
    if (events.length === 0) {
      return '📭 No events recorded for this position.';
    }

    let log = `📊 **Position Event Log** (${events.length} events)\n\n`;
    
    const sortedEvents = events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    sortedEvents.forEach((event, index) => {
      const emoji = this.getEventEmoji(event.kind);
      const date = this.formatDate(event.timestamp);
      
      log += `${emoji} **${event.kind.replace('_', ' ')}** - ${date}\n`;
      
      if (event.qtyDelta) {
        log += `   Quantity: ${event.qtyDelta.toFixed(6)}\n`;
      }
      
      if (event.price) {
        log += `   Price: $${event.price.toFixed(4)}\n`;
      }
      
      if (event.fee) {
        log += `   Fee: $${event.fee.toFixed(4)}\n`;
      }
      
      if (event.note) {
        log += `   Note: ${event.note}\n`;
      }
      
      if (index < sortedEvents.length - 1) {
        log += '\n';
      }
    });

    return log;
  }

  private static getEventEmoji(kind: string): string {
    const emojiMap: Record<string, string> = {
      'OPEN': '🚀',
      'SCALE_IN': '📈',
      'SCALE_OUT': '📉',
      'SL_HIT': '🛑',
      'TP_HIT': '🎯',
      'MANUAL_CLOSE': '✅',
      'ADJUST_SL': '🔧',
      'ADJUST_TP': '🎯',
      'NOTE': '📝'
    };
    return emojiMap[kind] || '📊';
  }

  private static formatDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  private static formatTimeAgo(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    
    if (seconds < 60) return `${seconds}s ago`;
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}