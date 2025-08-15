# AI Trading Bot — Hardened Taskbook (Manual Execution & Position Tracking)

**Project**: Telegram AI Trading Bot (TypeScript Monorepo)

**Goal (updated)**: Telegram-first workflow where the user picks market → symbol → timeframe. The bot fetches market data, computes indicators, invokes an AI Quant Strategist returning **strict JSON** (entry/SL/TP/position/confidence), optionally backtests it, and **does not auto-execute**. The **user opens/edits/closes positions manually** and the bot **tracks, alerts, and reports** on those positions.

---

## 0) Quickstart (Single Secure `.env`)

1. Copy `.env.example` → `.env` and fill in values.
2. `pnpm env:check` (dotenv-safe + zod).
3. `docker compose up -d` (Postgres/Redis).
4. `pnpm -r build && pnpm -r test`.
5. `pnpm bot:start` (long polling) or `pnpm bot:webhook` (prod).

**`.env.example` keys (single file, full coverage)**

```
# Telegram
TELEGRAM_BOT_TOKEN=
WEBHOOK_SECRET=

# AI Providers (choose any; routing handles fallbacks)
OPENROUTER_API_KEY=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

# Market Data (pick at least one equity provider)
POLYGON_API_KEY=
ALPHAVANTAGE_API_KEY=

# (Execution keys optional, not used for auto-trading)
BINANCE_KEY=
BINANCE_SECRET=
BYBIT_KEY=
BYBIT_SECRET=

# Infra
DATABASE_URL=postgresql://user:pass@localhost:5432/tradebot
REDIS_URL=redis://localhost:6379
PORT=8080
NODE_ENV=development
LOG_LEVEL=info

# Risk & Limits (defaults, overridable in chat /config)
DEFAULT_RISK_PCT=1.0
MAX_LEVERAGE=3
MIN_RR=1.3
DATA_STALENESS_SEC=300
BACKTEST_MAX_YEARS=2
```

Security hardening: `.gitignore` secrets, dotenv-safe+zod fail-fast, optional sops+age, quarterly key rotation.

---

## 1) Architecture Overview (updated)

```
Telegram (grammY)
  └─ Bot Router & FSM → AI Orchestrator → Indicators/Strategies → Backtester → Alerts
                                                                └→ Position Tracker (PnL, journaling)
Market Data Providers (CCXT + Yahoo/Polygon) → MarketData svc (Redis cache)
Persistence → Postgres/Prisma (users, requests, ai_outputs, signals, positions, position_events, backtests, alerts)
Observability → pino logs + Prometheus metrics + Health checks
Security → webhook secret, input validation, rate limiting
```

> **No auto-execution**: `/execution` package is optional/disabled by default and not part of MVP.

---

## 2) Monorepo Layout

```
repo/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  .env.example
  docker-compose.yml
  /packages
    /types
    /config          # zod env + dotenv-safe loader
    /logger          # pino + request IDs
    /marketdata      # providers + cache
    /indicators      # wrappers + snapshot
    /risk            # sizing + ATR SL + RR
    /strategies      # breakout/trend/meanrev
    /ai              # schema + prompts + repair
    /backtest        # engine + metrics + plot
    /alerts          # conditions + scheduler
    /positions       # tracking + PnL + journal (NEW)
    /db              # prisma client/migrations
    /execution       # (optional, disabled)
  /apps
    /bot             # grammY bot
    /api             # optional REST for health/metrics
```

---

## 3) Database Schema (Prisma) — updated

**New/changed tables**

- `positions(id, user_id, symbol, market, side, base_qty, quote_notional, entry_price,
          stop_loss, take_profit1, take_profit2, leverage, exchange, note, status,
          created_at, updated_at, closed_at)`
- `position_events(id, position_id, kind, qty_delta, price, fee, ts, note)`

  - `kind` ∈ `OPEN|SCALE_IN|SCALE_OUT|SL_HIT|TP_HIT|MANUAL_CLOSE|ADJUST_SL|ADJUST_TP|NOTE`

- `position_metrics(id, position_id, last_price, unrealized_pnl, unrealized_pnl_pct,
                 realized_pnl, max_dd_pct, max_runup_pct, updated_at)`

**Existing tables retained**

- `users, chats, watchlists, watchlist_items, requests, ai_outputs, signals, backtests, alerts`

**Remove/disable**

- `orders` (was for execution) → **drop or keep disabled**.

**Indexes**

- `positions(user_id, status)`; `position_events(position_id, ts)`; `signals(symbol,timeframe,created_at)`

**Tasks**

1. Update Prisma schema + migrations.
2. Add DB constraints (FKs, on delete cascade for events under a position).
3. Write seed + sample fixtures for demo.

**DoD**: CRUD works; referential integrity enforced.

---

## 4) Packages — Tasks

### 4.1 Market Data (unchanged functional goals)

- Provider interface, CCXT adapter, cache, and Yahoo/Polygon provider with gaps/holiday handling.

### 4.2 Indicators & Strategies (unchanged functional goals)

- RSI/MACD/EMA/ATR/BB/Donchian/OBV + snapshot; breakout/trend/meanrev functions.

### 4.3 Risk (read-only calculations)

- Keep ATR SL, RR calc, and size calculators **for what-if analysis** in cards.
- Do **not** place orders.

### 4.4 AI (schema-driven)

- Strict JSON plan; auto-repair; model routing; clamp.

### 4.5 Backtester

- Next-bar engine + metrics + optional plot.

### 4.6 Alerts

- Conditions: price/indicator/strategy zones **and** **position-linked** alerts (entry, SL, TP, trailing SL).
- Dedupe; hysteresis; catch-up on restart.

### 4.7 NEW: Positions Package (`/packages/positions`)

**Files**

- `src/schemas.ts` — zod schemas for manual position input (parse NL text & structured forms).
- `src/service.ts` — create/update/close; compute metrics; sync price; journal entries.
- `src/pnl.ts` — PnL math (realized/unrealized), run-up/drawdown, fees.
- `src/format.ts` — render Telegram messages/cards.
- `src/parser.ts` — parse commands like:

  - `LONG BTCUSDT 0.5 @ 62850 SL 61200 TP 64500,66000 x3 on BINANCE note: breakout`
  - `CLOSE 25% @ 64200 fee 0.04%`

**Capabilities**

- Multi-entry scaling; partial closes; fee support (bps/%); leverage for reporting only.
- Trailing stop (user-defined): absolute/ATR/percent.
- Position journal: freeform notes & strategy linkage (signal/request IDs).

**DoD**

- Unit tests for parser, PnL math, journal append; E2E flow passes.

---

## 5) Telegram Bot — Commands (updated)

### 5.1 Discovery & Analysis

- `/trade` — existing FSM (market → symbol → timeframe → mode: AI / Backtest / AI+BT).

### 5.2 Position Lifecycle (manual)

- `/position` — open **wizard** (inline keyboard + form)

  - Steps: side (Long/Short) → symbol → entry price → qty (base or quote) → SL → TP(s) → leverage (optional) → exchange (optional) → note → confirm
  - Output: creates `positions` row + initial `position_events(OPEN)`

- `/position parse` — paste **compact NL** line; bot parses & confirms before saving
- `/position list` — open positions (summary with PnL, RR to SL/TP1)
- `/position view <id>` — details + buttons: `Scale In`, `Scale Out`, `Adjust SL/TP`, `Add Note`, `Close`
- `/position scalein` — qty + price + fee → `SCALE_IN`
- `/position scaleout` — qty% + price + fee → `SCALE_OUT`
- `/position adjust` — `SL|TP1|TP2|trail` → new values → `ADJUST_*`
- `/position close` — qty% + price + fee → `MANUAL_CLOSE` (auto-close if 100%)

### 5.3 Reports & Journaling

- `/pnl` — period PnL summary (daily/weekly/monthly, realized vs unrealized)
- `/journal` — list/add notes tied to positions or general
- `/export` — CSV of positions/events for a date range

**UX Rules**

- Confirm before saving changes; `Cancel` everywhere; friendly parsing errors.
- Helpful examples on `/position parse`.

---

## 6) Alerts (updated scenarios)

- **Price hit**: entry zone, SL, TP levels.
- **Position-linked**:

  - Alert when price near SL/TP (e.g., within 0.2×ATR)
  - Trailing SL move confirmations
  - Daily PnL threshold alerts (e.g., -3% day)

- **Scheduling**: quiet hours; snooze; per-position mute.

**DoD**: alerts fire reliably; no duplicates; honor snooze/quiet hours.

---

## 7) Observability & Ops (unchanged + position metrics)

- Metrics: AI calls, schema fails, cache hit, backtest latency, **position metrics updates**, alert triggers.
- Health endpoints; runbook for provider/AI/DB/Redis incidents.

---

## 8) Security & Compliance (unchanged)

- Webhook signature; rate limiting; secrets in one `.env` (optionally sops); minimal PII; audit logs for position edits.

---

## 9) Testing Strategy (expanded for positions)

- **Unit**: indicators, snapshot, strategies, risk, schema, **parser & PnL math**.
- **Integration**: marketdata (mock+live), alerts with live price polling, position service with DB.
- **E2E**: `/trade` happy path; `/position` open/scale/adjust/close; alerts hitting SL/TP; CSV export.
- **Chaos**: restart during active positions → catch-up; price provider outage → graceful degrade.

**DoD**: all tests pass locally and in CI.

---

## 10) Acceptance Criteria (Global, updated)

- Analysis plan returned within **≤ 5s**; JSON schema-valid after ≤ 2 repairs.
- Backtest **< 2s** for 1y of 1h data.
- User can **open, scale, adjust, close** positions via commands and NL parse.
- **PnL and risk** computed correctly with fees and partial closes;

  - Verify with deterministic fixtures.

- Alerts trigger for SL/TP and trailing stops reliably; snooze/quiet hours honored.
- Single `.env` drives secrets; `pnpm env:check` enforces presence/shape.

---

## 11) Task Blueprints (≤ 2 files each)

**B1 — Position Schemas**

- Files: `packages/positions/src/schemas.ts`, `packages/positions/src/parser.ts`
- Deliverable: zod schemas; robust NL parser with examples & tests.

**B2 — Position Service**

- Files: `packages/positions/src/service.ts`, `packages/positions/src/pnl.ts`
- Deliverable: create/update/close; PnL math; event journal; tests.

**B3 — Position Formatting**

- Files: `packages/positions/src/format.ts`, `apps/bot/src/messages/positionCard.ts`
- Deliverable: Telegram-friendly cards & summaries.

**B4 — Bot Position Commands**

- File: `apps/bot/src/commands/position.ts`
- Deliverable: full lifecycle commands + parse flow + confirmations.

**B5 — Alerts: Position Hooks**

- Files: `packages/alerts/src/conditions.ts`, `packages/alerts/src/scheduler.ts`
- Deliverable: link alerts to positions; trailing SL; near-level warnings.

**B6 — Reports & Export**

- Files: `apps/bot/src/commands/pnl.ts`, `apps/bot/src/commands/export.ts`
- Deliverable: period PnL; CSV export.

**B7 — Migrations**

- File: `packages/db/prisma/schema.prisma` (+ migration)
- Deliverable: positions + position_events + position_metrics tables.

**B8 — Demo Fixtures**

- Files: `packages/db/seed.ts` + JSON fixtures
- Deliverable: example positions/events for demo & tests.

---

## 12) Milestones (solo realistic)

- **Week 1**: MarketData, Indicators, AI schema+prompt, Backtester
- **Week 2**: Alerts base, Position schemas+parser, Position service
- **Week 3**: Bot commands for `/position` + cards, Position-linked alerts
- **Week 4**: Reports/Export, Hardening, E2E tests, Demo polish

---

## 13) Model Routing (Cheap → Performance)

- **Cheap**: Qwen 2.5 (14–32B), Llama‑3.1 (8B/70B), Gemma‑2 9B via OpenRouter.
- **Performance**: GPT‑4o‑mini / GPT‑4.1, Claude 3.5 Sonnet, Gemini 2.5 Pro.

Policy: cheap first; on 2 schema failures or truncation, escalate once. Log costs.

---

## 14) Final Notes

- Keep functions small & pure; deterministic math for PnL.
- Document assumptions (fees, lot sizes, rounding).
- Provide `/position parse` examples in help.
- Execution package remains **off by default**; can be removed entirely if desired.
