import { Candle } from "@trade/types";

export function priceCrosses(
  currentPrice: number,
  targetPrice: number,
  direction: "above" | "below"
): boolean {
  if (direction === "above") {
    return currentPrice > targetPrice;
  } else {
    return currentPrice < targetPrice;
  }
}

export function indicatorCrosses(
  currentValue: number,
  targetValue: number,
  direction: "above" | "below"
): boolean {
  if (direction === "above") {
    return currentValue > targetValue;
  } else {
    return currentValue < targetValue;
  }
}

export function strategyZoneHit(
  currentValue: number,
  zoneMin: number,
  zoneMax: number
): boolean {
  return currentValue >= zoneMin && currentValue <= zoneMax;
}

export function percentageMove(
  initialPrice: number,
  currentPrice: number,
  percentage: number
): boolean {
  const move = ((currentPrice - initialPrice) / initialPrice) * 100;
  return Math.abs(move) >= percentage;
}