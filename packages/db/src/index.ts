import { PrismaClient } from '@prisma/client';
import { env } from '@trade/config';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: env.DATABASE_URL
    }
  },
  log: env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error']
});

export * from '@prisma/client';
export default prisma;