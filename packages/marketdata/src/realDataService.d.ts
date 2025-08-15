export declare class RealMarketDataService {
    getCryptoPrice(symbol: string): Promise<number>;
    getStockPrice(symbol: string): Promise<number>;
    getCryptoCandles(symbol: string, days?: number): Promise<any[]>;
    getMarketSentiment(symbol: string): Promise<any>;
    getTechnicalIndicators(symbol: string): Promise<any>;
    private symbolToCoinGeckoId;
    private getFallbackPrice;
    private calculateRSI;
    private calculateVolatility;
}
export declare const realMarketData: RealMarketDataService;
