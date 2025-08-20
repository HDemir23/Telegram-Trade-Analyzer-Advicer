# 🤖 AI Trading Bot - Complete Setup & Usage Guide

A comprehensive Telegram AI Trading Bot built with TypeScript in a monorepo architecture. This bot helps you analyze markets, track positions manually, and manage your trading portfolio without auto-execution.

## 📋 Table of Contents

- [🏗️ Architecture Overview](#️-architecture-overview)
- [⚡ Quick Start](#-quick-start)
- [🔧 Detailed Setup](#-detailed-setup)
- [📱 Bot Usage](#-bot-usage)
- [🚀 Deployment](#-deployment)
- [🔍 Development](#-development)
- [🐛 Troubleshooting](#-troubleshooting)
- [📚 API Reference](#-api-reference)

---

## 🏗️ Architecture Overview

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Telegram Bot  │───▶│  AI Orchestrator │───▶│   Market Data   │
│    (grammY)     │    │   (OpenAI/etc)   │    │ (Yahoo/CoinGecko)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Position Mgmt  │    │   Indicators     │    │     Redis       │
│   (Manual)      │    │ (RSI/MACD/ATR)   │    │   (Cache)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   PostgreSQL    │    │   Alerts &       │    │   Backtesting   │
│   (Database)    │    │   Risk Mgmt      │    │    Engine       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### 🎯 Key Features

- **🔍 AI Market Analysis** - GPT-4/Claude powered trading insights
- **📊 Position Tracking** - Manual position management with P&L
- **⚠️ Risk Management** - ATR stop losses, R:R ratios
- **🔔 Smart Alerts** - Price/indicator based notifications
- **📈 Backtesting** - Historical strategy validation
- **🌐 Multi-Provider** - Yahoo Finance, CoinGecko, Polygon
- **🔒 Security First** - Environment validation, webhook secrets

---

## ⚡ Quick Start

### 📋 Prerequisites

- **Node.js** ≥ 18.0.0
- **pnpm** ≥ 8.0.0 (recommended) or npm
- **Docker** & Docker Compose
- **Telegram Bot Token** ([Get one from @BotFather](https://t.me/botfather))

### 🚀 5-Minute Setup

```bash
# 1. Clone and setup
git clone <your-repo-url>
cd Trade
pnpm install

# 2. Environment setup
cp .env.example .env
# Edit .env with your API keys (see below)

# 3. Start infrastructure
docker compose up -d

# 4. Database setup
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 5. Validate environment
pnpm env:check

# 6. Start the bot
pnpm bot:start
```

### 📝 Essential Environment Variables

Edit your `.env` file with these **required** values:

```bash
# Telegram (Required)
TELEGRAM_BOT_TOKEN=your_bot_token_from_botfather
WEBHOOK_SECRET=your_random_secret_string

# Database (Required)
DATABASE_URL=postgresql://user:pass@localhost:5432/tradebot
REDIS_URL=redis://localhost:6379

# At least one AI provider (Required)
OPENAI_API_KEY=your_openai_key        # OR
ANTHROPIC_API_KEY=your_claude_key     # OR
OPENROUTER_API_KEY=your_openrouter_key

# Market data works with defaults (Yahoo Finance free)
# Optional: Add paid providers for better reliability
POLYGON_API_KEY=your_polygon_key      # Optional
ALPHAVANTAGE_API_KEY=your_av_key      # Optional
```

---

## 🔧 Detailed Setup

### 1️⃣ **System Requirements**

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| Node.js   | 18.0    | 20.0+       |
| RAM       | 512MB   | 2GB+        |
| Storage   | 1GB     | 5GB+        |
| CPU       | 1 core  | 2+ cores    |

### 2️⃣ **Installation Steps**

#### Install Dependencies
```bash
# Using pnpm (recommended)
pnpm install

# Or using npm
npm install

# Or using yarn
yarn install
```

#### Verify Installation
```bash
# Check workspace structure
pnpm -r ls

# Verify TypeScript compilation
pnpm build

# Run tests
pnpm test
```

### 3️⃣ **Environment Configuration**

#### Complete `.env` Configuration
```bash
# ================================
# TELEGRAM CONFIGURATION
# ================================
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
WEBHOOK_SECRET=your-super-secret-webhook-string-here

# ================================
# AI PROVIDERS (Choose at least one)
# ================================
# OpenAI (GPT-4, GPT-4o-mini)
OPENAI_API_KEY=sk-proj-...

# Anthropic (Claude 3.5 Sonnet)
ANTHROPIC_API_KEY=sk-ant-...

# OpenRouter (Multiple models)
OPENROUTER_API_KEY=sk-or-...

# ================================
# MARKET DATA PROVIDERS
# ================================
# FREE providers (no API key needed)
# - Yahoo Finance (equities/ETFs)
# - CoinGecko (crypto)
# - Binance public API (crypto)

# PREMIUM providers (optional)
POLYGON_API_KEY=your_polygon_key      # $99/month for real-time
ALPHAVANTAGE_API_KEY=your_av_key      # Free tier: 5 calls/min
FINNHUB_API_KEY=your_finnhub_key      # Free tier: 60 calls/min
TWELVEDATA_API_KEY=your_12data_key    # Free tier: 800 calls/day
IEX_CLOUD_TOKEN=your_iex_token        # Freemium model

# Provider routing (left = higher priority)
MARKETDATA_CRYPTO_PROVIDERS=coingecko,binance
MARKETDATA_EQUITY_PROVIDERS=yahoo,finnhub,alphavantage

# ================================
# INFRASTRUCTURE
# ================================
DATABASE_URL=postgresql://tradebot:password@localhost:5432/tradebot
REDIS_URL=redis://localhost:6379
PORT=8080
NODE_ENV=development
LOG_LEVEL=info

# ================================
# TRADING CONFIGURATION
# ================================
DEFAULT_RISK_PCT=1.0          # Default risk per trade (%)
MAX_LEVERAGE=3                # Maximum allowed leverage
MIN_RR=1.3                   # Minimum risk:reward ratio
DATA_STALENESS_SEC=300        # Max age for cached data (seconds)
BACKTEST_MAX_YEARS=2          # Maximum backtest duration

# ================================
# EXECUTION (Optional - Disabled by default)
# ================================
# BINANCE_KEY=your_binance_api_key
# BINANCE_SECRET=your_binance_secret
# BYBIT_KEY=your_bybit_api_key
# BYBIT_SECRET=your_bybit_secret
```

#### Environment Validation
```bash
# Validate all required environment variables
pnpm env:check

# Output should show:
# ✅ Environment validation passed
# ✅ All required variables present
# ✅ Database connection successful
# ✅ Redis connection successful
```

### 4️⃣ **Database Setup**

#### Using Docker (Recommended)
```bash
# Start PostgreSQL and Redis
docker compose up -d

# Verify services are running
docker compose ps
```

#### Manual Installation
```bash
# Install PostgreSQL
brew install postgresql  # macOS
sudo apt install postgresql  # Ubuntu

# Install Redis
brew install redis  # macOS
sudo apt install redis-server  # Ubuntu

# Start services
brew services start postgresql redis  # macOS
sudo systemctl start postgresql redis  # Ubuntu
```

#### Database Initialization
```bash
# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:migrate

# Seed with demo data
pnpm db:seed

# Verify database setup
pnpm db:studio  # Opens Prisma Studio
```

### 5️⃣ **Telegram Bot Setup**

1. **Create Bot**:
   ```
   1. Message @BotFather on Telegram
   2. Send /newbot
   3. Choose bot name: "Your Trading Bot"
   4. Choose username: "your_trading_bot"
   5. Copy the token to your .env file
   ```

2. **Configure Bot Settings**:
   ```
   /setdescription - AI Trading Assistant
   /setcommands - 
   start - Start the bot
   help - Show available commands
   trade - Analyze markets
   position - Manage positions
   pnl - View profit & loss
   alerts - Manage alerts
   config - Bot settings
   ```

3. **Test Bot**:
   ```bash
   # Start bot in development
   pnpm bot:start
   
   # Test in Telegram
   /start
   ```

---

## 📱 Bot Usage

### 🎯 **Core Commands**

| Command | Description | Example |
|---------|-------------|---------|
| `/start` | Initialize bot | `/start` |
| `/help` | Show all commands | `/help` |
| `/trade` | Market analysis | `/trade` |
| `/position` | Position management | `/position list` |
| `/pnl` | Portfolio summary | `/pnl weekly` |
| `/alerts` | Alert management | `/alerts list` |

### 📊 **Position Management**

#### Opening Positions

**Option 1: Interactive Menu**
```
/position
→ Click "Open Position"
→ Follow step-by-step wizard
```

**Option 2: Text Parsing** (Quick Entry)
```
/position parse

Then send:
LONG BTCUSDT 0.5 @ 62850 SL 61200 TP 64500,66000 x3 ON BINANCE note: breakout
```

#### Position Commands
```bash
# View all positions
/position list

# View specific position
/position view abc123

# Parse position from text
/position parse
LONG AAPL 100 @ 180.50 SL 175.00 TP 190.00

# Scale into position
SCALE IN 0.25 @ 62000 note: averaging down

# Scale out of position  
SCALE OUT 0.3 @ 65000 note: taking profits

# Close position
CLOSE 50% @ 64200 note: partial close
CLOSE @ 65000 note: full close
```

#### Position Text Format
```
SIDE SYMBOL QUANTITY @ PRICE [SL price] [TP price1,price2] [x leverage] [ON exchange] [note: text]

Examples:
✅ LONG BTCUSDT 0.5 @ 62850 SL 61200 TP 64500,66000 x3 ON BINANCE note: breakout
✅ SHORT ETHUSDT 2.0 @ 3450 SL 3520 TP 3300 note: resistance bounce  
✅ LONG AAPL 100 @ 180.50 SL 175.00 TP 190.00
✅ LONG TSLA 50 @ 250 SL 240 TP 270,290 note: earnings play
```

### 🔍 **Market Analysis**

#### Trading Workflow
```
1. /trade
2. Select Market (Crypto/Equity/Forex)
3. Choose Symbol (BTCUSDT, AAPL, etc.)
4. Pick Timeframe (1h, 4h, 1d)
5. Analysis Mode (AI Only, Backtest, Both)
6. Review AI recommendations
7. Execute manually via /position
```

#### AI Analysis Output
```markdown
📊 **BTCUSDT Analysis (4H)**

**Market Context:**
• Trend: Bullish continuation
• Support: $62,200 | Resistance: $64,800
• Volume: Above average (+23%)

**Technical Signals:**
• RSI: 58 (neutral-bullish)
• MACD: Bullish crossover confirmed
• ATR: $1,250 (14-period)

**AI Recommendation:**
📈 **LONG Entry Strategy**
• Entry Zone: $62,850 - $63,100
• Stop Loss: $61,200 (ATR-based)
• Take Profit 1: $64,500 (R:R 1:2.1)
• Take Profit 2: $66,000 (R:R 1:3.4)
• Position Size: 2% risk
• Confidence: 78%

**Reasoning:**
Bullish breakout above key resistance with volume confirmation. Momentum indicators support upward move...
```

### 📈 **Portfolio Management**

#### P&L Tracking
```bash
# Portfolio overview
/pnl

# Detailed reports
/pnl daily    # Today's performance
/pnl weekly   # This week
/pnl monthly  # This month
/pnl ytd      # Year to date

# Export data
/export csv positions 2024-01-01 2024-12-31
/export json trades last-30-days
```

#### Portfolio Analytics
- **Unrealized P&L**: Open position profits/losses
- **Realized P&L**: Closed position results  
- **Win Rate**: Percentage of profitable trades
- **Risk/Reward**: Average R:R ratios
- **Max Drawdown**: Largest loss from peak
- **Sharpe Ratio**: Risk-adjusted returns

### 🔔 **Alerts & Notifications**

#### Setting Up Alerts
```bash
# Price alerts
/alerts add BTCUSDT price above 65000
/alerts add AAPL price below 175

# Technical indicator alerts
/alerts add BTCUSDT RSI below 30
/alerts add ETHUSDT MACD bullish_crossover

# Position-based alerts
/alerts add position_123 price near_stoploss
/alerts add portfolio daily_loss above 5%
```

#### Alert Types
- 📊 **Price Alerts**: Above/below thresholds
- 📈 **Technical Alerts**: Indicator conditions
- ⚠️ **Risk Alerts**: Stop loss proximity  
- 💰 **P&L Alerts**: Daily/weekly thresholds
- 🎯 **Target Alerts**: Take profit levels

---

## 🚀 Deployment

### 🐳 **Docker Deployment (Recommended)**

#### Production Docker Setup
```bash
# 1. Build production image
docker build -t trading-bot:latest .

# 2. Production docker-compose
cp docker-compose.prod.yml docker-compose.yml

# 3. Set production environment
cp .env.example .env.production
# Edit .env.production with production values

# 4. Deploy
docker compose -f docker-compose.prod.yml up -d

# 5. Health check
curl http://localhost:8080/health
```

#### `docker-compose.prod.yml`
```yaml
version: '3.8'

services:
  bot:
    build: .
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://tradebot:${DB_PASSWORD}@db:5432/tradebot
      - REDIS_URL=redis://redis:6379
    env_file:
      - .env.production
    depends_on:
      - db
      - redis
    restart: unless-stopped
    ports:
      - "8080:8080"

  db:
    image: postgres:15
    environment:
      - POSTGRES_USER=tradebot
      - POSTGRES_PASSWORD=${DB_PASSWORD}
      - POSTGRES_DB=tradebot
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:
```

### ☁️ **Cloud Deployment**

#### **Railway** (Easy)
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and deploy
railway login
railway init
railway add postgresql redis
railway deploy
```

#### **Heroku** (Popular)
```bash
# 1. Install Heroku CLI
# 2. Create app
heroku create your-trading-bot

# 3. Add addons
heroku addons:create heroku-postgresql:mini
heroku addons:create heroku-redis:mini

# 4. Set config vars
heroku config:set TELEGRAM_BOT_TOKEN=your_token
heroku config:set NODE_ENV=production

# 5. Deploy
git push heroku main
```

#### **VPS Deployment** (Advanced)
```bash
# 1. Server setup (Ubuntu 22.04)
sudo apt update && sudo apt upgrade -y
sudo apt install nginx certbot python3-certbot-nginx

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install nodejs

# 3. Install pnpm
npm install -g pnpm

# 4. Setup application
git clone your-repo
cd trading-bot
pnpm install
pnpm build

# 5. Process manager
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 startup
pm2 save

# 6. Nginx reverse proxy
sudo nano /etc/nginx/sites-available/trading-bot
sudo ln -s /etc/nginx/sites-available/trading-bot /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 7. SSL certificate
sudo certbot --nginx -d your-domain.com
```

#### `ecosystem.config.js` (PM2)
```javascript
module.exports = {
  apps: [{
    name: 'trading-bot',
    script: 'dist/apps/bot/src/index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 8080
    },
    error_file: 'logs/err.log',
    out_file: 'logs/out.log',
    log_file: 'logs/combined.log',
    time: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

### 🌐 **Webhook Setup** (Production)

#### Setting Webhook URL
```bash
# Set webhook (replace with your domain)
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://your-domain.com/webhook" \
  -d "secret_token=${WEBHOOK_SECRET}"

# Verify webhook
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

#### Nginx Configuration
```nginx
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location /webhook {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /health {
        proxy_pass http://localhost:8080;
    }
}
```

---

## 🔍 Development

### 🛠️ **Development Setup**

```bash
# Clone repository
git clone your-repo-url
cd trading-bot

# Install dependencies
pnpm install

# Start development servers
pnpm dev        # Watch mode for all packages
pnpm bot:dev    # Bot development mode
pnpm db:studio  # Database GUI

# Run tests
pnpm test              # All tests
pnpm test:watch        # Watch mode
pnpm test:coverage     # Coverage report
```

### 📁 **Project Structure**

```
Trade/
├── apps/
│   ├── bot/                 # Telegram bot application
│   │   ├── src/
│   │   │   ├── commands/    # Bot command handlers
│   │   │   ├── middleware/  # Bot middleware
│   │   │   └── index.ts     # Bot entry point
│   │   └── package.json
│   └── api/                 # Optional REST API
├── packages/
│   ├── config/              # Environment configuration
│   ├── logger/              # Logging utilities
│   ├── marketdata/          # Market data providers
│   ├── db/                  # Database & Prisma setup
│   ├── positions/           # Position management
│   ├── indicators/          # Technical indicators
│   ├── strategies/          # Trading strategies
│   ├── ai/                  # AI prompt engineering
│   ├── backtest/            # Backtesting engine
│   ├── alerts/              # Alert system
│   ├── risk/                # Risk management
│   └── types/               # Shared TypeScript types
├── .env.example             # Environment template
├── docker-compose.yml       # Development services
├── pnpm-workspace.yaml      # Workspace configuration
├── tsconfig.json            # TypeScript root config
└── README.md               # This file
```

### 🧪 **Testing Strategy**

#### Unit Tests
```bash
# Test individual packages
pnpm --filter @trade/positions test
pnpm --filter @trade/indicators test

# Test specific files
pnpm test positions/parser
pnpm test indicators/rsi
```

#### Integration Tests
```bash
# Database integration
pnpm test:integration db

# Market data providers
pnpm test:integration marketdata

# Bot commands
pnpm test:integration bot
```

#### E2E Tests
```bash
# Full workflow tests
pnpm test:e2e position-lifecycle
pnpm test:e2e trading-workflow
```

### 🔧 **Debugging**

#### Enable Debug Logging
```bash
# Set debug environment
export LOG_LEVEL=debug
export NODE_ENV=development

# Start with verbose logging
pnpm bot:start
```

#### Debug Specific Components
```bash
# Market data issues
DEBUG=marketdata:* pnpm bot:start

# Database queries
DEBUG=prisma:* pnpm bot:start

# AI API calls
DEBUG=ai:* pnpm bot:start
```

#### Common Debug Commands
```bash
# Check bot status
curl http://localhost:8080/health

# Inspect database
pnpm db:studio

# View logs
tail -f logs/combined.log

# Monitor Redis
redis-cli monitor
```

---

## 🐛 Troubleshooting

### ❌ **Common Issues**

#### Bot Not Responding
```bash
# Check bot token
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe"

# Verify webhook
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"

# Check logs
tail -f logs/err.log
```

#### Database Connection Errors
```bash
# Test connection
pnpm db:studio

# Reset database
pnpm db:reset
pnpm db:migrate
pnpm db:seed

# Check Docker services
docker compose ps
docker compose logs db
```

#### Market Data Issues
```bash
# Test providers
node -e "
const { MarketDataService } = require('./dist/packages/marketdata');
const service = new MarketDataService(config, redisUrl);
service.getCurrentPrice('BTCUSDT').then(console.log);
"

# Check API limits
# Yahoo Finance: No limits (unofficial)
# CoinGecko: 10-50 calls/min
# Polygon: Depends on plan
```

#### AI API Errors
```bash
# Test OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# Test Anthropic
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":1,"messages":[{"role":"user","content":"test"}]}'
```

### 🔧 **Performance Issues**

#### Memory Usage
```bash
# Monitor memory
htop
pm2 monit

# Optimize Node.js
export NODE_OPTIONS="--max-old-space-size=2048"
```

#### Database Performance
```bash
# Check slow queries
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY total_time DESC 
LIMIT 10;

# Optimize indexes
EXPLAIN ANALYZE SELECT * FROM positions WHERE user_id = 'abc123';
```

#### Rate Limiting
```bash
# Check API usage
grep "rate limit" logs/combined.log

# Implement backoff
# See packages/marketdata/src/service.ts
```

### 📊 **Monitoring**

#### Health Checks
```bash
# Application health
curl http://localhost:8080/health

# Database health
curl http://localhost:8080/health/db

# Redis health
curl http://localhost:8080/health/redis
```

#### Metrics Collection
```bash
# Prometheus metrics (if enabled)
curl http://localhost:8080/metrics

# Custom metrics
grep "metric:" logs/combined.log
```

---

## 📚 API Reference

### 🔌 **Environment Variables**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | ✅ | - | Bot token from @BotFather |
| `WEBHOOK_SECRET` | ✅ | - | Webhook security secret |
| `DATABASE_URL` | ✅ | - | PostgreSQL connection string |
| `REDIS_URL` | ✅ | - | Redis connection string |
| `OPENAI_API_KEY` | ⚠️ | - | OpenAI API key (or other AI) |
| `NODE_ENV` | ❌ | `development` | Environment mode |
| `LOG_LEVEL` | ❌ | `info` | Logging level |
| `DEFAULT_RISK_PCT` | ❌ | `1.0` | Default risk percentage |
| `MAX_LEVERAGE` | ❌ | `3` | Maximum leverage allowed |

### 📝 **Package Scripts**

| Script | Description |
|--------|-------------|
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm env:check` | Validate environment |
| `pnpm bot:start` | Start bot (polling) |
| `pnpm bot:webhook` | Start bot (webhook) |
| `pnpm db:generate` | Generate Prisma client |
| `pnpm db:migrate` | Run database migrations |
| `pnpm db:seed` | Seed database with demo data |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm dev` | Development mode (all packages) |

### 🗄️ **Database Schema**

#### Core Tables
- `users` - User profiles and settings
- `positions` - Trading positions
- `position_events` - Position lifecycle events
- `position_metrics` - P&L calculations
- `signals` - AI trading signals
- `alerts` - User alert preferences
- `backtests` - Historical test results

#### Key Relationships
```sql
users (1) -> (N) positions
positions (1) -> (N) position_events  
positions (1) -> (1) position_metrics
users (1) -> (N) alerts
requests (1) -> (N) ai_outputs
```

### 🎯 **Position States**

| State | Description | Transitions |
|-------|-------------|-------------|
| `OPEN` | Active position | → `CLOSED` |
| `CLOSED` | Completed position | (final) |

### 📊 **Event Types**

| Event | Description | Fields |
|-------|-------------|---------|
| `OPEN` | Position opened | `qtyDelta`, `price`, `fee` |
| `SCALE_IN` | Added to position | `qtyDelta`, `price`, `fee` |
| `SCALE_OUT` | Reduced position | `qtyDelta`, `price`, `fee` |
| `SL_HIT` | Stop loss triggered | `qtyDelta`, `price` |
| `TP_HIT` | Take profit hit | `qtyDelta`, `price` |
| `MANUAL_CLOSE` | Manual closure | `qtyDelta`, `price`, `fee` |
| `ADJUST_SL` | Stop loss modified | - |
| `ADJUST_TP` | Take profit modified | - |
| `NOTE` | Journal entry | `note` |

---

## 🤝 Contributing

### 📋 **Development Guidelines**

1. **Code Style**: Follow TypeScript best practices
2. **Testing**: Write tests for new features
3. **Documentation**: Update README for changes
4. **Commits**: Use conventional commit format
5. **Security**: Never commit API keys

### 🔧 **Adding Features**

1. Create feature branch: `git checkout -b feature/new-indicator`
2. Implement in appropriate package
3. Add tests: `packages/indicators/src/__tests__/`
4. Update documentation
5. Submit pull request

### 🐛 **Bug Reports**

Include:
- Environment details (`NODE_ENV`, OS, Node version)
- Steps to reproduce
- Expected vs actual behavior
- Relevant logs
- Configuration (anonymized)

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

---

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/your-repo/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **Email**: support@yourbot.com
- **Telegram**: [@YourBotSupport](https://t.me/YourBotSupport)

---

## 🙏 Acknowledgments

- **grammY** - Modern Telegram Bot framework
- **Prisma** - Next-generation ORM
- **TechnicalIndicators** - TA calculation library
- **OpenAI/Anthropic** - AI model providers
- **Yahoo Finance** - Free market data

---

**⚠️ Disclaimer**: This bot is for educational and research purposes. Trading involves risk. Always do your own research and never risk more than you can afford to lose.

---

*Last updated: $(date)*






🔄 Starting optimized iterative analysis for BTCUSDT with 3 focused questions...
❓ Question trend_momentum: Trend direction, momentum strength
⚠️ trend_momentum failed: Error: Question timeout after 45s
❓ Question entry_exit: Entry zones, stop placement, targets
⚠️ trend_momentum failed: Error: Question timeout after 45s
❓ Question entry_exit: Entry zones, stop placement, targets
⚠️ trend_momentum failed: Error: Question timeout after 45s
❓ Question entry_exit: Entry zones, stop placement, targets
⚠️ trend_momentum failed: Error: Question timeout after 45s
❓ Question entry_exit: Entry zones, stop placement, targets
⚠️ trend_momentum failed: Error: Question timeout after 45s
❓ Question entry_exit: Entry zones, stop placement, targets
🔍 API Response for openai/gpt-5-mini: {
  status: 200,
  choices: 1,
  usage: { prompt_tokens: 213, completion_tokens: 4783, total_tokens: 4996 },
  error: undefined
}
✅ AI call successful with openai/gpt-5-mini
🔍 API Response for openai/gpt-5-mini: {
  status: 200,
  choices: 1,
  usage: { prompt_tokens: 213, completion_tokens: 5133, total_tokens: 5346 },
  error: undefined
}
⚠️ entry_exit failed: Error: Question timeout after 45s
❓ Question final_decision: Final trading decision with complete JSON
⚠️ entry_exit failed: Error: Question timeout after 45s
❓ Question final_decision: Final trading decision with complete JSON
⚠️ entry_exit failed: Error: Question timeout after 45s
❓ Question final_decision: Final trading decision with complete JSON
⚠️ entry_exit failed: Error: Question timeout after 45s
❓ Question final_decision: Final trading decision with complete JSON
⚠️ entry_exit failed: Error: Question timeout after 45s
❓ Question final_decision: Final trading decision with complete JSON
