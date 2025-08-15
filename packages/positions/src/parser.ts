import { ParsedPositionSchema, ParsedPosition, PositionSide } from './schemas';
import { z } from 'zod';

export class PositionParser {
  static parse(input: string): ParsedPosition {
    const cleaned = input.trim().toUpperCase();
    
    const longPattern = /^(LONG|BUY)\s+([A-Z0-9]+)\s+([\d.]+)\s*@\s*([\d.]+)(?:\s+SL\s+([\d.]+))?(?:\s+TP\s+([\d.,]+))?(?:\s+[xX](\d+))?(?:\s+(?:ON\s+)?([A-Z]+))?(?:\s+(?:NOTE:?\s*)?(.+))?$/;
    const shortPattern = /^(SHORT|SELL)\s+([A-Z0-9]+)\s+([\d.]+)\s*@\s*([\d.]+)(?:\s+SL\s+([\d.]+))?(?:\s+TP\s+([\d.,]+))?(?:\s+[xX](\d+))?(?:\s+(?:ON\s+)?([A-Z]+))?(?:\s+(?:NOTE:?\s*)?(.+))?$/;
    
    let match = cleaned.match(longPattern) || cleaned.match(shortPattern);
    
    if (!match) {
      throw new Error('Invalid position format. Expected: LONG/SHORT SYMBOL QTY @ PRICE [SL price] [TP price1,price2] [x leverage] [ON exchange] [note: text]');
    }

    const [
      ,
      sideStr,
      symbol,
      qtyStr,
      priceStr,
      slStr,
      tpStr,
      leverageStr,
      exchange,
      note
    ] = match;

    const side: PositionSide = sideStr === 'LONG' || sideStr === 'BUY' ? 'LONG' : 'SHORT';
    const baseQty = parseFloat(qtyStr);
    const entryPrice = parseFloat(priceStr);
    const stopLoss = slStr ? parseFloat(slStr) : undefined;
    const leverage = leverageStr ? parseInt(leverageStr) : undefined;

    let takeProfit1: number | undefined;
    let takeProfit2: number | undefined;
    
    if (tpStr) {
      const tpPrices = tpStr.split(',').map(p => parseFloat(p.trim()));
      takeProfit1 = tpPrices[0];
      takeProfit2 = tpPrices[1];
    }

    if (baseQty <= 0 || entryPrice <= 0) {
      throw new Error('Quantity and price must be positive numbers');
    }

    if (stopLoss && side === 'LONG' && stopLoss >= entryPrice) {
      throw new Error('For LONG positions, stop loss must be below entry price');
    }

    if (stopLoss && side === 'SHORT' && stopLoss <= entryPrice) {
      throw new Error('For SHORT positions, stop loss must be above entry price');
    }

    const parsed: ParsedPosition = {
      side,
      symbol,
      baseQty,
      entryPrice,
      stopLoss,
      takeProfit1,
      takeProfit2,
      leverage,
      exchange: exchange || undefined,
      note: note?.trim() || undefined
    };

    return ParsedPositionSchema.parse(parsed);
  }

  static parseCloseCommand(input: string): { qtyPercent: number; price?: number; note?: string } {
    const cleaned = input.trim().toUpperCase();
    
    const patterns = [
      /^CLOSE\s+(\d+(?:\.\d+)?)%(?:\s*@\s*([\d.]+))?(?:\s+(?:NOTE:?\s*)?(.+))?$/,
      /^CLOSE\s+(\d+(?:\.\d+)?)(?:\s*@\s*([\d.]+))?(?:\s+(?:NOTE:?\s*)?(.+))?$/,
      /^CLOSE(?:\s*@\s*([\d.]+))?(?:\s+(?:NOTE:?\s*)?(.+))?$/
    ];

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        const qtyPercent = match[1] ? parseFloat(match[1]) : 100;
        const price = match[2] ? parseFloat(match[2]) : undefined;
        const note = match[3]?.trim() || undefined;

        if (qtyPercent <= 0 || qtyPercent > 100) {
          throw new Error('Close percentage must be between 0 and 100');
        }

        return { qtyPercent, price, note };
      }
    }

    throw new Error('Invalid close command format. Expected: CLOSE [qty%] [@ price] [note: text]');
  }

  static parseScaleCommand(input: string): { qtyDelta: number; price: number; note?: string; isScaleIn: boolean } {
    const cleaned = input.trim().toUpperCase();
    
    const scaleInPattern = /^(?:SCALE\s*IN|ADD)\s+([\d.]+)(?:\s*@\s*([\d.]+))?(?:\s+(?:NOTE:?\s*)?(.+))?$/;
    const scaleOutPattern = /^(?:SCALE\s*OUT|REDUCE)\s+([\d.]+)(?:\s*@\s*([\d.]+))?(?:\s+(?:NOTE:?\s*)?(.+))?$/;
    
    let match = cleaned.match(scaleInPattern);
    let isScaleIn = true;
    
    if (!match) {
      match = cleaned.match(scaleOutPattern);
      isScaleIn = false;
    }

    if (!match) {
      throw new Error('Invalid scale command format. Expected: SCALE IN/OUT qty [@ price] [note: text]');
    }

    const qtyDelta = parseFloat(match[1]);
    const price = match[2] ? parseFloat(match[2]) : undefined;
    const note = match[3]?.trim() || undefined;

    if (qtyDelta <= 0) {
      throw new Error('Quantity must be positive');
    }

    if (!price) {
      throw new Error('Price is required for scale operations');
    }

    return { qtyDelta, price, note, isScaleIn };
  }

  static getExamples(): string[] {
    return [
      'LONG BTCUSDT 0.5 @ 62850 SL 61200 TP 64500,66000 x3 ON BINANCE note: breakout',
      'SHORT ETHUSDT 2.0 @ 3450 SL 3520 TP 3300 note: resistance bounce',
      'LONG AAPL 100 @ 180.50 SL 175.00 TP 190.00',
      'CLOSE 50% @ 64200 note: taking profits',
      'SCALE IN 0.25 @ 62000 note: averaging down',
      'SCALE OUT 0.3 @ 65000 note: reducing risk'
    ];
  }
}