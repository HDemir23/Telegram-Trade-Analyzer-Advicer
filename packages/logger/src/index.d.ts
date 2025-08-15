import pino from 'pino';
declare const createLogger: (name?: string) => import("pino").Logger<never>;
export declare const logger: import("pino").Logger<never>;
export { createLogger };
export type Logger = pino.Logger;
