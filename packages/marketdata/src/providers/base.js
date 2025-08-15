"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseProvider = void 0;
class BaseProvider {
    validateSymbol(symbol) {
        if (!symbol || typeof symbol !== 'string') {
            throw new Error('Invalid symbol format');
        }
    }
    validateTimeframe(timeframe) {
        const validTimeframes = ['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
        if (!validTimeframes.includes(timeframe)) {
            throw new Error(`Invalid timeframe: ${timeframe}`);
        }
    }
}
exports.BaseProvider = BaseProvider;
