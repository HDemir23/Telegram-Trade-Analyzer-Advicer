import { Position, PositionEvent } from '@prisma/client';

export interface PnLCalculation {
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  realizedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  avgEntryPrice: number;
  currentQty: number;
  maxRunupPct: number;
  maxDrawdownPct: number;
  riskRewardRatio: number;
}

export class PnLCalculator {
  static calculate(
    position: Position & { events: PositionEvent[] },
    currentPrice: number
  ): PnLCalculation {
    const events = position.events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    let totalQtyIn = 0;
    let totalCostBasis = 0;
    let currentQty = 0;
    let realizedPnl = 0;
    let maxRunupPct = 0;
    let maxDrawdownPct = 0;

    for (const event of events) {
      switch (event.kind) {
        case 'OPEN':
        case 'SCALE_IN':
          if (event.qtyDelta && event.price) {
            totalQtyIn += event.qtyDelta;
            totalCostBasis += event.qtyDelta * event.price;
            currentQty += event.qtyDelta;
            
            if (event.fee) {
              totalCostBasis += event.fee;
            }
          }
          break;

        case 'SCALE_OUT':
        case 'MANUAL_CLOSE':
        case 'SL_HIT':
        case 'TP_HIT':
          if (event.qtyDelta && event.price && currentQty > 0) {
            const avgEntryPrice = totalCostBasis / totalQtyIn;
            const exitQty = Math.min(event.qtyDelta, currentQty);
            
            let pnlForExit: number;
            if (position.side === 'LONG') {
              pnlForExit = exitQty * (event.price - avgEntryPrice);
            } else {
              pnlForExit = exitQty * (avgEntryPrice - event.price);
            }
            
            if (event.fee) {
              pnlForExit -= event.fee;
            }
            
            realizedPnl += pnlForExit;
            currentQty -= exitQty;
          }
          break;
      }
    }

    const avgEntryPrice = totalQtyIn > 0 ? totalCostBasis / totalQtyIn : position.entryPrice;
    
    let unrealizedPnl = 0;
    if (currentQty > 0) {
      if (position.side === 'LONG') {
        unrealizedPnl = currentQty * (currentPrice - avgEntryPrice);
      } else {
        unrealizedPnl = currentQty * (avgEntryPrice - currentPrice);
      }
    }

    const totalInvested = totalQtyIn * avgEntryPrice;
    const unrealizedPnlPct = totalInvested > 0 ? (unrealizedPnl / totalInvested) * 100 : 0;
    const totalPnl = realizedPnl + unrealizedPnl;
    const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    const highestPrice = Math.max(currentPrice, ...events.map(e => e.price || 0));
    const lowestPrice = Math.min(currentPrice, ...events.filter(e => e.price).map(e => e.price!));

    if (position.side === 'LONG') {
      maxRunupPct = ((highestPrice - avgEntryPrice) / avgEntryPrice) * 100;
      maxDrawdownPct = ((avgEntryPrice - lowestPrice) / avgEntryPrice) * 100;
    } else {
      maxRunupPct = ((avgEntryPrice - lowestPrice) / avgEntryPrice) * 100;
      maxDrawdownPct = ((highestPrice - avgEntryPrice) / avgEntryPrice) * 100;
    }

    let riskRewardRatio = 0;
    if (position.stopLoss && position.takeProfit1) {
      const riskDistance = Math.abs(position.entryPrice - position.stopLoss);
      const rewardDistance = Math.abs(position.takeProfit1 - position.entryPrice);
      riskRewardRatio = rewardDistance / riskDistance;
    }

    return {
      unrealizedPnl,
      unrealizedPnlPct,
      realizedPnl,
      totalPnl,
      totalPnlPct,
      avgEntryPrice,
      currentQty,
      maxRunupPct: Math.max(0, maxRunupPct),
      maxDrawdownPct: Math.max(0, maxDrawdownPct),
      riskRewardRatio
    };
  }

  static calculateRiskReward(
    entryPrice: number,
    stopLoss: number | null,
    takeProfit: number | null,
    side: 'LONG' | 'SHORT'
  ): number {
    if (!stopLoss || !takeProfit) return 0;

    let riskDistance: number;
    let rewardDistance: number;

    if (side === 'LONG') {
      riskDistance = entryPrice - stopLoss;
      rewardDistance = takeProfit - entryPrice;
    } else {
      riskDistance = stopLoss - entryPrice;
      rewardDistance = entryPrice - takeProfit;
    }

    return riskDistance > 0 ? rewardDistance / riskDistance : 0;
  }

  static calculatePositionSize(
    accountBalance: number,
    riskPercent: number,
    entryPrice: number,
    stopLoss: number,
    side: 'LONG' | 'SHORT'
  ): { baseQty: number; quoteNotional: number; riskAmount: number } {
    const riskAmount = accountBalance * (riskPercent / 100);
    const riskPerUnit = Math.abs(entryPrice - stopLoss);
    const baseQty = riskAmount / riskPerUnit;
    const quoteNotional = baseQty * entryPrice;

    return {
      baseQty,
      quoteNotional,
      riskAmount
    };
  }

  static calculateFeeImpact(
    quantity: number,
    price: number,
    feeRate: number
  ): { fee: number; feePercent: number } {
    const notional = quantity * price;
    const fee = notional * (feeRate / 100);
    const feePercent = (fee / notional) * 100;

    return { fee, feePercent };
  }
}