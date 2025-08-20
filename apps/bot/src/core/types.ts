import { Context, SessionFlavor } from 'grammy';

export interface SessionData {
  userId?: number;
  chatId?: number;
  lastCommand?: string;
  awaitingPositionParse?: boolean;
  awaitingSymbolInput?: boolean;
  tradeFlow?: {
    step?: string;
    market?: string;
    symbol?: string;
    timeframe?: string;
  };
  tradeState?: {
    market?: string;
    symbol?: string;
    timeframe?: string;
    mode?: string;
  };
  positionWizard?: {
    step?: number;
    side?: string;
    symbol?: string;
    quantity?: number;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit1?: number;
    takeProfit2?: number;
    leverage?: number;
    exchange?: string;
    note?: string;
  };
}

export type MyContext = Context & SessionFlavor<SessionData>;