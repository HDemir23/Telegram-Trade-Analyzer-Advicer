// Position Tracking System
// Allows users to follow positions with automated 6h/12h notifications

import { analyzeAssetV2 } from '../core/main-orchestrator';
import { autoScanner } from './auto-scanner';

export interface TrackedPosition {
  id: string;
  userId: number;
  symbol: string;
  entry: {
    price: number;
    timestamp: number;
    direction: 'long' | 'short';
  };
  targets: {
    price: number;
    hit: boolean;
    timestamp?: number;
  }[];
  stopLoss: number;
  currentPrice?: number;
  pnl?: number;
  pnlPercent?: number;
  status: 'active' | 'closed' | 'stopped';
  strategy: string;
  timeframe: string;
  riskReward: number;
  lastUpdate: number;
  notifications: {
    interval: 6 | 12; // hours
    lastSent: number;
  };
  metadata: {
    confidence: number;
    originalAnalysis: any;
    followStartTime: number;
  };
}

export interface PositionUpdate {
  position: TrackedPosition;
  priceChange: number;
  priceChangePercent: number;
  recommendation: 'hold' | 'take_profit' | 'stop_loss' | 'scale_out';
  reasoning: string;
  nextTarget?: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export class PositionTracker {
  private positions: Map<string, TrackedPosition> = new Map();
  private monitoringInterval: NodeJS.Timeout | null = null;
  private notificationCallbacks: Map<number, (update: PositionUpdate) => Promise<void>> = new Map();

  constructor() {
    console.log('📊 Position Tracker initialized');
  }

  // Follow a new position
  followPosition(
    userId: number,
    symbol: string,
    analysis: any,
    notificationInterval: 6 | 12 = 6
  ): string {
    const positionId = `${userId}_${symbol}_${Date.now()}`;
    
    const position: TrackedPosition = {
      id: positionId,
      userId,
      symbol,
      entry: {
        price: analysis.entry.price || analysis.entry.lower || 0,
        timestamp: Date.now(),
        direction: analysis.position
      },
      targets: analysis.targets.map((t: any) => ({
        price: t.price,
        hit: false
      })),
      stopLoss: analysis.stop || 0,
      status: 'active',
      strategy: analysis.rationale.substring(0, 100),
      timeframe: analysis.timeframe,
      riskReward: analysis.realized_rr_est || 0,
      lastUpdate: Date.now(),
      notifications: {
        interval: notificationInterval,
        lastSent: Date.now()
      },
      metadata: {
        confidence: analysis.confidence,
        originalAnalysis: analysis,
        followStartTime: Date.now()
      }
    };

    this.positions.set(positionId, position);
    console.log(`👀 Following position: ${symbol} for user ${userId}`);
    
    return positionId;
  }

  // Stop following a position
  unfollowPosition(positionId: string): boolean {
    if (this.positions.has(positionId)) {
      this.positions.delete(positionId);
      console.log(`🛑 Stopped following position: ${positionId}`);
      return true;
    }
    return false;
  }

  // Get user's positions
  getUserPositions(userId: number): TrackedPosition[] {
    return Array.from(this.positions.values())
      .filter(pos => pos.userId === userId && pos.status === 'active');
  }

  // Get all active positions
  getAllActivePositions(): TrackedPosition[] {
    return Array.from(this.positions.values())
      .filter(pos => pos.status === 'active');
  }

  // Register notification callback for a user
  registerNotificationCallback(userId: number, callback: (update: PositionUpdate) => Promise<void>) {
    this.notificationCallbacks.set(userId, callback);
  }

  // Start automated monitoring
  startMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    // Check every hour, but only send notifications based on user preferences
    this.monitoringInterval = setInterval(() => {
      this.checkAllPositions().catch(console.error);
    }, 60 * 60 * 1000); // 1 hour

    console.log('🔄 Position monitoring started');
  }

  // Stop automated monitoring
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('⏹️ Position monitoring stopped');
    }
  }

  // Check all positions for updates
  private async checkAllPositions(): Promise<void> {
    const activePositions = this.getAllActivePositions();
    console.log(`🔍 Checking ${activePositions.length} active positions`);

    for (const position of activePositions) {
      try {
        await this.checkPosition(position);
      } catch (error) {
        console.warn(`⚠️ Failed to check position ${position.id}: ${error}`);
      }
    }
  }

  // Check individual position
  private async checkPosition(position: TrackedPosition): Promise<void> {
    const now = Date.now();
    const hoursSinceLastUpdate = (now - position.notifications.lastSent) / (1000 * 60 * 60);

    // Only check if notification interval has passed
    if (hoursSinceLastUpdate < position.notifications.interval) {
      return;
    }

    try {
      // Get fresh analysis
      const freshAnalysis = await analyzeAssetV2(position.symbol, 'openai/gpt-5-mini');
      
      // Update position with current price
      const currentPrice = freshAnalysis.entry.price || freshAnalysis.entry.lower || 0;
      const updatedPosition = await this.updatePositionPnL(position, currentPrice);
      
      // Create position update
      const update = await this.createPositionUpdate(updatedPosition, freshAnalysis);
      
      // Send notification
      const callback = this.notificationCallbacks.get(position.userId);
      if (callback) {
        await callback(update);
        
        // Update last notification time
        position.notifications.lastSent = now;
        position.lastUpdate = now;
      }

    } catch (error) {
      console.warn(`⚠️ Failed to analyze ${position.symbol}: ${error}`);
    }
  }

  // Update position PnL
  private async updatePositionPnL(position: TrackedPosition, currentPrice: number): Promise<TrackedPosition> {
    position.currentPrice = currentPrice;
    
    // Calculate PnL based on direction
    if (position.entry.direction === 'long') {
      position.pnl = currentPrice - position.entry.price;
      position.pnlPercent = (position.pnl / position.entry.price) * 100;
    } else {
      position.pnl = position.entry.price - currentPrice;
      position.pnlPercent = (position.pnl / position.entry.price) * 100;
    }

    // Check target hits
    for (const target of position.targets) {
      if (!target.hit) {
        const targetHit = position.entry.direction === 'long' 
          ? currentPrice >= target.price
          : currentPrice <= target.price;
          
        if (targetHit) {
          target.hit = true;
          target.timestamp = Date.now();
        }
      }
    }

    // Check stop loss
    const stopHit = position.entry.direction === 'long'
      ? currentPrice <= position.stopLoss
      : currentPrice >= position.stopLoss;
      
    if (stopHit && position.status === 'active') {
      position.status = 'stopped';
    }

    return position;
  }

  // Create position update with AI recommendations
  private async createPositionUpdate(position: TrackedPosition, freshAnalysis: any): Promise<PositionUpdate> {
    const priceChange = (position.currentPrice || 0) - position.entry.price;
    const priceChangePercent = (priceChange / position.entry.price) * 100;
    
    // Determine recommendation based on analysis and position status
    let recommendation: 'hold' | 'take_profit' | 'stop_loss' | 'scale_out' = 'hold';
    let reasoning = '';
    
    // Check if stopped out
    if (position.status === 'stopped') {
      recommendation = 'stop_loss';
      reasoning = 'Stop loss triggered';
    }
    // Check if targets hit
    else if (position.targets.some(t => t.hit)) {
      const hitTargets = position.targets.filter(t => t.hit).length;
      if (hitTargets >= position.targets.length / 2) {
        recommendation = 'scale_out';
        reasoning = `${hitTargets} targets hit, consider scaling out`;
      } else {
        recommendation = 'take_profit';
        reasoning = `Target${hitTargets > 1 ? 's' : ''} hit, take partial profits`;
      }
    }
    // Check fresh analysis sentiment
    else if (freshAnalysis.position !== position.entry.direction) {
      recommendation = 'stop_loss';
      reasoning = `Analysis changed from ${position.entry.direction} to ${freshAnalysis.position}`;
    }
    
    // Determine risk level
    const riskLevel: 'low' | 'medium' | 'high' = 
      Math.abs(position.pnlPercent || 0) > 5 ? 'high' :
      Math.abs(position.pnlPercent || 0) > 2 ? 'medium' : 'low';

    return {
      position,
      priceChange,
      priceChangePercent,
      recommendation,
      reasoning,
      nextTarget: position.targets.find(t => !t.hit)?.price,
      riskLevel
    };
  }

  // Format position update for display
  formatPositionUpdate(update: PositionUpdate): string {
    const { position, priceChange, priceChangePercent, recommendation, reasoning } = update;
    const pnlSign = (position.pnlPercent || 0) >= 0 ? '+' : '';
    const pnlColor = (position.pnlPercent || 0) >= 0 ? '🟢' : '🔴';
    const directionEmoji = position.entry.direction === 'long' ? '📈' : '📉';
    
    let response = `${directionEmoji} **${position.symbol} Update**\n\n`;
    
    // Position info
    response += `📊 **Position:** ${position.entry.direction.toUpperCase()}\n`;
    response += `💰 **Entry:** $${position.entry.price.toFixed(4)}\n`;
    response += `💵 **Current:** $${(position.currentPrice || 0).toFixed(4)}\n`;
    response += `${pnlColor} **P&L:** ${pnlSign}${(position.pnlPercent || 0).toFixed(2)}%\n\n`;
    
    // Targets progress
    const hitTargets = position.targets.filter(t => t.hit).length;
    response += `🎯 **Targets:** ${hitTargets}/${position.targets.length} hit\n`;
    
    if (update.nextTarget) {
      response += `⏭️ **Next Target:** $${update.nextTarget.toFixed(4)}\n`;
    }
    
    response += `🛡️ **Stop Loss:** $${position.stopLoss.toFixed(4)}\n\n`;
    
    // Recommendation
    const recEmoji = {
      'hold': '⏸️',
      'take_profit': '💰',
      'stop_loss': '🛑',
      'scale_out': '📉'
    }[recommendation];
    
    response += `${recEmoji} **Recommendation:** ${recommendation.replace('_', ' ').toUpperCase()}\n`;
    response += `💭 **Reasoning:** ${reasoning}\n\n`;
    
    // Risk level
    const riskEmoji = {
      'low': '🟢',
      'medium': '🟡', 
      'high': '🔴'
    }[update.riskLevel];
    
    response += `${riskEmoji} **Risk Level:** ${update.riskLevel.toUpperCase()}\n`;
    
    const elapsed = Math.round((Date.now() - position.metadata.followStartTime) / (1000 * 60 * 60));
    response += `⏱️ **Following for:** ${elapsed}h\n`;
    
    return response;
  }

  // Get position stats
  getPositionStats(userId?: number): any {
    const positions = userId 
      ? this.getUserPositions(userId)
      : this.getAllActivePositions();
      
    const totalPositions = positions.length;
    const profitablePositions = positions.filter(p => (p.pnlPercent || 0) > 0).length;
    const avgPnL = positions.reduce((sum, p) => sum + (p.pnlPercent || 0), 0) / totalPositions || 0;
    
    return {
      total: totalPositions,
      profitable: profitablePositions,
      winRate: totalPositions > 0 ? (profitablePositions / totalPositions * 100).toFixed(1) : 0,
      avgPnL: avgPnL.toFixed(2)
    };
  }
}

// Global position tracker instance
export const positionTracker = new PositionTracker();