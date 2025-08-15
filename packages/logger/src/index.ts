import pino from 'pino';
import { env } from '@trade/config';

const createLogger = (name?: string) => {
  return pino({
    name: name || 'trade-bot',
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname'
      }
    } : undefined
  });
};

export const logger = createLogger();
export { createLogger };
export type Logger = pino.Logger;