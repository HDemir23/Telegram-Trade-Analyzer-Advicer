import { z } from 'zod';

export const PositionSideSchema = z.enum(['LONG', 'SHORT']);
export const PositionStatusSchema = z.enum(['OPEN', 'CLOSED']);
export const PositionEventKindSchema = z.enum([
  'OPEN', 'SCALE_IN', 'SCALE_OUT', 'SL_HIT', 'TP_HIT', 
  'MANUAL_CLOSE', 'ADJUST_SL', 'ADJUST_TP', 'NOTE'
]);

export const CreatePositionSchema = z.object({
  userId: z.string(),
  symbol: z.string().min(1),
  market: z.string().min(1),
  side: PositionSideSchema,
  baseQty: z.number().positive(),
  quoteNotional: z.number().positive(),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive().optional(),
  takeProfit1: z.number().positive().optional(),
  takeProfit2: z.number().positive().optional(),
  leverage: z.number().positive().max(100).optional(),
  exchange: z.string().optional(),
  note: z.string().optional()
});

export const UpdatePositionSchema = z.object({
  stopLoss: z.number().positive().optional(),
  takeProfit1: z.number().positive().optional(),
  takeProfit2: z.number().positive().optional(),
  note: z.string().optional()
});

export const PositionEventSchema = z.object({
  positionId: z.string(),
  kind: PositionEventKindSchema,
  qtyDelta: z.number().optional(),
  price: z.number().positive().optional(),
  fee: z.number().nonnegative().optional(),
  note: z.string().optional()
});

export const ScalePositionSchema = z.object({
  qtyDelta: z.number().positive(),
  price: z.number().positive(),
  fee: z.number().nonnegative().optional(),
  note: z.string().optional()
});

export const ClosePositionSchema = z.object({
  qtyPercent: z.number().min(0).max(100).default(100),
  price: z.number().positive(),
  fee: z.number().nonnegative().optional(),
  note: z.string().optional()
});

export const ParsedPositionSchema = z.object({
  side: PositionSideSchema,
  symbol: z.string(),
  baseQty: z.number().positive(),
  entryPrice: z.number().positive(),
  stopLoss: z.number().positive().optional(),
  takeProfit1: z.number().positive().optional(),
  takeProfit2: z.number().positive().optional(),
  leverage: z.number().positive().optional(),
  exchange: z.string().optional(),
  note: z.string().optional()
});

export type PositionSide = z.infer<typeof PositionSideSchema>;
export type PositionStatus = z.infer<typeof PositionStatusSchema>;
export type PositionEventKind = z.infer<typeof PositionEventKindSchema>;
export type CreatePosition = z.infer<typeof CreatePositionSchema>;
export type UpdatePosition = z.infer<typeof UpdatePositionSchema>;
export type PositionEvent = z.infer<typeof PositionEventSchema>;
export type ScalePosition = z.infer<typeof ScalePositionSchema>;
export type ClosePosition = z.infer<typeof ClosePositionSchema>;
export type ParsedPosition = z.infer<typeof ParsedPositionSchema>;