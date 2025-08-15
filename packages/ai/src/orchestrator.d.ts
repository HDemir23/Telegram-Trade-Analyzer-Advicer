import { type MultiAssetOutput } from './schema';
interface AnalysisRequestOptions {
    horizon: string;
    markets: string[];
    symbols: string[];
    prefer: string[];
    include_global: boolean;
    top: number;
}
interface AnalysisRequest {
    analysis_request: {
        horizon: string;
        markets: string[];
        symbols: string[];
        prefer: string[];
        include_global: boolean;
        top: number;
        notes_from_data_md?: string;
    };
    universe: {
        crypto?: string[];
        spx?: string[];
        bist?: string[];
    };
    data: {
        marketData?: any;
        technical?: any;
        orderbook?: any;
        onchain?: any;
        sentiment?: any;
        fundamentals?: any;
        derivatives?: any;
    };
    constraints: {
        max_symbols: number;
        token_budget: number;
    };
}
export declare function buildAnalysisRequest(opts: AnalysisRequestOptions, dataDigest?: string): Promise<AnalysisRequest>;
export declare function askMultiAssetPlan(input: AnalysisRequest): Promise<MultiAssetOutput>;
export {};
//# sourceMappingURL=orchestrator.d.ts.map