import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const demoUser = await prisma.user.upsert({
    where: { telegramId: 123456789n },
    update: {},
    create: {
      telegramId: 123456789n,
      username: 'demo_user',
      firstName: 'Demo',
      lastName: 'User'
    }
  });

  const demoChat = await prisma.chat.upsert({
    where: { telegramId: 987654321n },
    update: {},
    create: {
      telegramId: 987654321n,
      type: 'private',
      title: 'Demo Chat'
    }
  });

  const demoPosition = await prisma.position.create({
    data: {
      userId: demoUser.id,
      symbol: 'BTCUSDT',
      market: 'crypto',
      side: 'LONG',
      baseQty: 0.5,
      quoteNotional: 31425,
      entryPrice: 62850,
      stopLoss: 61200,
      takeProfit1: 64500,
      takeProfit2: 66000,
      leverage: 3,
      exchange: 'BINANCE',
      note: 'breakout trade'
    }
  });

  await prisma.positionEvent.create({
    data: {
      positionId: demoPosition.id,
      kind: 'OPEN',
      qtyDelta: 0.5,
      price: 62850,
      fee: 0.075,
      note: 'Initial position open'
    }
  });

  await prisma.positionMetric.create({
    data: {
      positionId: demoPosition.id,
      lastPrice: 63200,
      unrealizedPnl: 175,
      unrealizedPnlPct: 0.56,
      realizedPnl: 0,
      maxDdPct: 0,
      maxRunupPct: 0.56
    }
  });

  const watchlist = await prisma.watchlist.create({
    data: {
      userId: demoUser.id,
      name: 'Crypto Watchlist',
      items: {
        create: [
          { symbol: 'BTCUSDT', market: 'crypto' },
          { symbol: 'ETHUSDT', market: 'crypto' },
          { symbol: 'ADAUSDT', market: 'crypto' }
        ]
      }
    }
  });

  console.log('Seeding completed!');
  console.log('Demo user:', demoUser);
  console.log('Demo position:', demoPosition);
  console.log('Demo watchlist:', watchlist);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });