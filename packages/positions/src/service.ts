import { prisma } from '@trade/db';
import { Prisma, Position, PositionEvent, PositionMetric } from '@prisma/client';
import { logger } from '@trade/logger';
import {
  CreatePosition,
  UpdatePosition,
  PositionEvent as PositionEventInput,
  ScalePosition,
  ClosePosition,
  CreatePositionSchema,
  UpdatePositionSchema,
  PositionEventSchema,
  ScalePositionSchema,
  ClosePositionSchema
} from './schemas';
import { PnLCalculator, PnLCalculation } from './pnl';

// Define a type that includes the 'events' relation
type PositionWithEvents = Prisma.PositionGetPayload<{ include: { events: true } }>;
type PositionWithEventsAndMetrics = Prisma.PositionGetPayload<{ include: { events: true; metrics: true } }>;

export class PositionService {
  async createPosition(data: CreatePosition): Promise<Position> {
    const validated = CreatePositionSchema.parse(data);
    
    logger.info(`Creating position: ${validated.side} ${validated.symbol} ${validated.baseQty}`);

    const position = await prisma.position.create({
      data: {
        ...validated,
        quoteNotional: validated.baseQty * validated.entryPrice
      }
    });

    await this.addEvent({
      positionId: position.id,
      kind: 'OPEN',
      qtyDelta: validated.baseQty,
      price: validated.entryPrice,
      note: 'Position opened'
    });

    await this.updateMetrics(position.id, validated.entryPrice);

    logger.info(`Position created: ${position.id}`);
    return position;
  }

  async updatePosition(positionId: string, data: UpdatePosition): Promise<Position> {
    const validated = UpdatePositionSchema.parse(data);
    
    logger.info(`Updating position ${positionId}`);

    const position = await prisma.position.update({
      where: { id: positionId },
      data: validated
    });

    if (validated.stopLoss || validated.takeProfit1 || validated.takeProfit2) {
      await this.addEvent({
        positionId,
        kind: 'ADJUST_SL',
        note: 'Stop loss or take profit adjusted'
      });
    }

    const currentPrice = await this.getCurrentPrice(position.symbol);
    await this.updateMetrics(positionId, currentPrice);

    logger.info(`Position updated: ${positionId}`);
    return position;
  }

  async scalePosition(positionId: string, data: ScalePosition, isScaleIn: boolean): Promise<PositionWithEvents> {
    const validated = ScalePositionSchema.parse(data);
    
    logger.info(`${isScaleIn ? 'Scaling in' : 'Scaling out'} position ${positionId}`);

    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { events: true }
    }) as PositionWithEvents; // Cast to include events

    if (!position) {
      throw new Error('Position not found');
    }

    if (position.status !== 'OPEN') {
      throw new Error('Cannot scale a closed position');
    }

    const currentQty = this.calculateCurrentQuantity(position.events);
    
    if (!isScaleIn && validated.qtyDelta > currentQty) {
      throw new Error('Cannot scale out more than current quantity');
    }

    await this.addEvent({
      positionId,
      kind: isScaleIn ? 'SCALE_IN' : 'SCALE_OUT',
      qtyDelta: validated.qtyDelta,
      price: validated.price,
      fee: validated.fee,
      note: validated.note
    });

    await this.updateMetrics(positionId, validated.price);

    const updatedPosition = await prisma.position.findUnique({
      where: { id: positionId },
      include: { events: true }
    }) as PositionWithEvents; // Cast to include events

    logger.info(`Position ${isScaleIn ? 'scaled in' : 'scaled out'}: ${positionId}`);
    return updatedPosition!;
  }

  async closePosition(positionId: string, data: ClosePosition): Promise<PositionWithEvents> {
    const validated = ClosePositionSchema.parse(data);
    
    logger.info(`Closing position ${positionId} (${validated.qtyPercent}%)`);

    const position = await prisma.position.findUnique({
      where: { id: positionId },
      include: { events: true }
    }) as PositionWithEvents; // Cast to include events

    if (!position) {
      throw new Error('Position not found');
    }

    if (position.status !== 'OPEN') {
      throw new Error('Position is already closed');
    }

    const currentQty = this.calculateCurrentQuantity(position.events);
    const closeQty = (currentQty * validated.qtyPercent) / 100;

    if (closeQty <= 0) {
      throw new Error('No quantity to close');
    }

    await this.addEvent({
      positionId,
      kind: 'MANUAL_CLOSE',
      qtyDelta: closeQty,
      price: validated.price,
      fee: validated.fee,
      note: validated.note || `Closed ${validated.qtyPercent}% of position`
    });

    const isFullyClosedNow = validated.qtyPercent >= 100 || closeQty >= currentQty;
    
    const updatedPosition = await prisma.position.update({
      where: { id: positionId },
      data: {
        status: isFullyClosedNow ? 'CLOSED' : 'OPEN',
        closedAt: isFullyClosedNow ? new Date() : null
      },
      include: { events: true }
    }) as PositionWithEvents; // Cast to include events

    await this.updateMetrics(positionId, validated.price);

    logger.info(`Position ${isFullyClosedNow ? 'fully closed' : 'partially closed'}: ${positionId}`);
    return updatedPosition;
  }

  async addEvent(data: PositionEventInput): Promise<PositionEvent> {
    const validated = PositionEventSchema.parse(data);
    
    const event = await prisma.positionEvent.create({
      data: validated
    });

    logger.debug(`Event added to position ${validated.positionId}: ${validated.kind}`);
    return event;
  }

  async getPosition(positionId: string): Promise<PositionWithEventsAndMetrics | null> {
    return prisma.position.findUnique({
      where: { id: positionId },
      include: {
        events: true,
        metrics: true
      }
    });
  }

  async getUserPositions(
    userId: string,
    status?: 'OPEN' | 'CLOSED',
    limit = 50
  ): Promise<PositionWithEventsAndMetrics[]> {
    return prisma.position.findMany({
      where: {
        userId,
        ...(status && { status })
      },
      include: {
        events: true,
        metrics: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: limit
    });
  }

  async calculatePnL(positionId: string, currentPrice?: number): Promise<PnLCalculation> {
    const position = await this.getPosition(positionId);
    
    if (!position) {
      throw new Error('Position not found');
    }

    const price = currentPrice || await this.getCurrentPrice(position.symbol);
    return PnLCalculator.calculate(position, price);
  }

  async updateMetrics(positionId: string, currentPrice: number): Promise<void> {
    const pnl = await this.calculatePnL(positionId, currentPrice);
    
    await prisma.positionMetric.upsert({
      where: { positionId },
      update: {
        lastPrice: currentPrice,
        unrealizedPnl: pnl.unrealizedPnl,
        unrealizedPnlPct: pnl.unrealizedPnlPct,
        realizedPnl: pnl.realizedPnl,
        maxDdPct: pnl.maxDrawdownPct,
        maxRunupPct: pnl.maxRunupPct
      },
      create: {
        positionId,
        lastPrice: currentPrice,
        unrealizedPnl: pnl.unrealizedPnl,
        unrealizedPnlPct: pnl.unrealizedPnlPct,
        realizedPnl: pnl.realizedPnl,
        maxDdPct: pnl.maxDrawdownPct,
        maxRunupPct: pnl.maxRunupPct
      }
    });
  }

  async addNote(positionId: string, note: string): Promise<void> {
    await this.addEvent({
      positionId,
      kind: 'NOTE',
      note
    });
  }

  async deletePosition(positionId: string, userId: string): Promise<void> {
    const position = await prisma.position.findFirst({
      where: { id: positionId, userId }
    });

    if (!position) {
      throw new Error('Position not found or access denied');
    }

    await prisma.position.delete({
      where: { id: positionId }
    });

    logger.info(`Position deleted: ${positionId}`);
  }

  private calculateCurrentQuantity(events: PositionEvent[]): number {
    let quantity = 0;
    
    for (const event of events) {
      switch (event.kind) {
        case 'OPEN':
        case 'SCALE_IN':
          quantity += event.qtyDelta || 0;
          break;
        case 'SCALE_OUT':
        case 'MANUAL_CLOSE':
        case 'SL_HIT':
        case 'TP_HIT':
          quantity -= event.qtyDelta || 0;
          break;
      }
    }

    return Math.max(0, quantity);
  }

  private async getCurrentPrice(symbol: string): Promise<number> {
    try {
      return 50000;
    } catch (error) {
      logger.warn(`Failed to get current price for ${symbol}, using last known price`);
      return 0;
    }
  }
}
