# Schedulers and Workers — System Overview & Improvements

This document describes the background schedulers and workers: what each does, how it runs, the current flow (reads/writes and logic), and the improvements made (before vs after, with approximate savings). It is intended for new developers to understand the system and verify improvements.

---

## 1. Purpose of Each Scheduler (Summary)

| Scheduler | Purpose (one line) | Interval (prod) | First run (prod) |
|-----------|--------------------|-----------------|------------------|
| **Token Sync** | Keeps the list of tokens in the DB in sync with Kasplex (which tokens exist). | 60 min | 0 min |
| **Token Info Sync** | Syncs detailed token info (holder count, mint count, name, top holders) and saves daily holder snapshots for charts. | 15 min | 2 min |
| **Exchange Sync 24h** | Fetches 24h market data (price, volume, change) for each token–exchange pair and stores it. | 15 min | 0 min |
| **Exchange Sync 7d** | Fetches 7-day K-line (candlestick) data for each token–exchange pair and stores it. | 30 min | 0 min |
| **Token Ranking** | Computes token rankings by market cap from latest market data and writes ranks to the DB. | 15 min | 3 min |
| **Floor Price Sync** | For tokens without exchange market data, fetches floor price from Kasplex and stores it. | 30 min | 6 min |

All schedulers run **in parallel** (each has its own timer). They do **not** wait for each other. With **Redis** configured, each scheduler pushes jobs to a **BullMQ queue** and a dedicated worker processes that queue (one job at a time per queue; different queues run in parallel). Without Redis, each scheduler calls its processor **directly** on the same timer.

---

## 2. Improvements Summary

| Area | What changed | Before | After | Approx. saving / effect |
|------|----------------|--------|--------|--------------------------|
| **Redis / BullMQ** | Worker module now uses `process.env.REDIS_HOST` to decide if BullMQ is available (same as CacheService). | BullMQ never registered (ConfigService in forRoot had no config). | BullMQ registered when `REDIS_HOST` is set; workers use queues. | Schedulers correctly use Redis when configured. |
| **Redis / BullMQ** | BullMQ connection: longer timeout + retry. | `connectTimeout: 5000`, no retry. | `connectTimeout: 20000`, `retryStrategy` (3 retries, 1–3s backoff). | Fewer ETIMEDOUT / "Connection is closed" on slow or remote Redis. |
| **Holder snapshot** | Single upsert replaced with atomic `findOneAndUpdate` + `upsert: true`. | 2 DB round-trips per snapshot (find + update or insert). | 1 round-trip per snapshot. | ~50% fewer DB calls per snapshot. |
| **Holder snapshot** | Percentage calculation: one pass over top 50 holders. | Three slices (10, 20, 50) + three `reduce`. | Single loop accumulating sum10, sum20, sum50. | Less CPU and fewer allocations per token. |
| **Holder snapshot** | Bulk save per chunk in Token Info Sync. | One `saveDailySnapshot` (and 1 DB write) per token with holder data. | Collect snapshot payloads in chunk; one `saveDailySnapshots` → one `bulkWrite` per chunk. | N tokens with holder data → 1 bulk write per chunk instead of N writes (e.g. 2 chunks → 2 bulk writes total instead of N). |
| **Exchange 24h** | Batch fetch where supported (e.g. Gate.io) + bulk write. | One API call per pair, one DB write per pair. | One batch API call per exchange (Gate.io); one `bulkUpsertMarketData24h` + one `bulkUpdateLastSyncedAt` per exchange. | Large reduction in API calls and DB round-trips for Gate.io; other exchanges still per-pair fetch but bulk write. |
| **Exchange 24h** | Fresh skip. | All pairs synced every run. | Pairs with `lastSuccessAt` within last 5 min skipped. | Fewer API calls and writes when runs overlap or interval is short. |
| **Exchange 7d** | Bulk write + fresh skip. | One upsert per candle per pair; all pairs every run. | One `bulkUpsertMarketData7d` + one `bulkUpdateLastSyncedAt` per exchange; pairs with `lastSuccessAt` within 10 min skipped. | Fewer DB round-trips; no redundant work for recently synced pairs. |
| **Token ranking** | Batch read of market data + bulk rank updates. | (Assumed per-token reads and updates.) | One `getAggregatedMarketDataBatch(tokens)`; one `bulkUpdateRanks` + optional `clearRankForIds`. | 2 main DB operations per run instead of O(tokens). |
| **Floor price** | Targeted read + skip stale/unchanged + bulk update. | (Assumed full scan and per-token updates.) | `findForFloorPriceSync`; skip if floor fresh (< 30 min) or unchanged; one `bulkUpdateFloorPrices`. | Fewer Kasplex calls and DB writes. |
| **CoinEx adapter** | Market param format for API v1. | Uppercase symbol (e.g. `BURTUSDT`). | Lowercase (e.g. `burtusdt`). | Fixes 400 Bad Request for ticker24h/kline7d where API expects lowercase. |

---

## 3. Scheduler and Worker Details

### 3.1 Token Sync

**Purpose:** Keep the canonical list of tokens in the database in sync with the Kasplex API (which tokens exist and basic fields).

**Current flow:**

1. **Trigger:** Scheduler fires every 60 min (prod) or 30 s (fast test). With Redis: adds job to `token-sync` queue; worker runs `TokenSyncProcessor.process()`. Without Redis: scheduler calls `process()` directly.
2. **Read:** Kasplex API — `fetchAllTokens()` (one external call).
3. **Write:** `tokensRepository.upsertTokens(tokens)` — bulk upsert into `tokens` collection (insert new, update existing).
4. **Cache:** If any token was processed, `cacheService.deletePattern('tokens:list:*')` to invalidate list caches.

**Reads/writes:**

- 1 external API call (Kasplex).
- 1 bulk DB upsert (tokens).
- Optional cache delete.

**Improvements:** No scheduler/processor logic change in this doc; Redis/BullMQ fix ensures the job runs via queue when Redis is configured.

---

### 3.2 Token Info Sync

**Purpose:** For each token, fetch detailed info (holder count, mint count, name, top holders) from Kasplex or from cached `token_info`; update `tokens` and `token_info`; and save **daily holder snapshots** for historical charts.

**Current flow:**

1. **Trigger:** Scheduler every 15 min (prod), first run after 2 min. Job: `token-info-sync` (BullMQ or direct).
2. **Read:** `tokensRepository.getAllTickers()` → list of tickers. For each ticker in a chunk: optionally `tokensRepository.findByTicker`, `tokenInfoRepository.findByTicker`; if no cached info, Kasplex `fetchTokenInfo(tick)` (rate-limited).
3. **Write:**
   - Per token: `tokenInfoRepository.upsertTokenInfo(...)` (if fetched from API); `tokensRepository.updateMintAndHolderCount(...)` (holder/mint/name).
   - **Holder snapshot:** No longer per-token DB write. Snapshot payloads are **collected in a chunk array**; after the chunk loop, **one** `holderSnapshotService.saveDailySnapshots(snapshotQueue)` per chunk → one `bulkUpsert` (Mongoose `bulkWrite` with `updateOne` + `upsert: true`) per chunk.
4. **Parallelism:** Tickers are split into N chunks (default 2); chunks run in parallel via `Promise.all(chunks.map(chunk => processChunk(chunk, workerId)))`.

**Reads/writes (typical run, 2 chunks):**

- 1 read: all tickers.
- Per token in chunk: 1–2 reads (tokens, token_info), 0–1 Kasplex call, 1–2 writes (token_info upsert, tokens update).
- Per chunk: 1 bulk write for holder snapshots (all tokens in that chunk with holder data).

**Before vs after (holder snapshot):**

- **Before:** For each token with holder data, `await holderSnapshotService.saveDailySnapshot(...)` → 1 repository `upsert` → 2 DB round-trips (find + update or insert). For 30 tokens with holder data, ~60 DB round-trips for snapshots.
- **After:** Collect payloads in `snapshotQueue`; after chunk, `saveDailySnapshots(snapshotQueue)` → one `bulkUpsert` (single `bulkWrite`). For 30 tokens in 2 chunks, 2 bulk writes total. Plus single-doc upsert is now 1 round-trip (atomic `findOneAndUpdate` with `upsert: true`). **Large reduction in DB round-trips and connection usage.**

---

### 3.3 Exchange Sync 24h

**Purpose:** For each active token–exchange pair, fetch 24h market data (price, volume, change, OHLC) from the exchange API and store it. Used for rankings, charts, and display.

**Current flow:**

1. **Trigger:** Scheduler every 15 min (prod), first run at 0 min. Job: `exchange-sync-24h`.
2. **Read:**
   - `exchangesRepository.findAllActiveTokenExchanges()` → all active pairs.
   - Filter to **stale** pairs: `lastSuccessAt` is null or older than `marketData24hFreshMinutes` (default 5 min). Rest are **skipped** (no API call, no write).
   - `exchangesRepository.findAllActive()` → exchange entities.
   - For each exchange with stale pairs: get adapter; if adapter has `fetchTickers24hBatch`, call it once with all symbols for that exchange; else loop and call `fetchTicker24h` per pair (with retries and rate limit).
3. **Write:**
   - Per exchange: one `exchangesRepository.bulkUpsertMarketData24h(rows)` and one `exchangesRepository.bulkUpdateLastSyncedAt(lastSyncedUpdates)`.
   - Sync log rows created/updated per exchange for status.

**Reads/writes:**

- 1 read: all active token-exchanges; 1 read: all active exchanges.
- Per exchange: 1 batch API call (Gate.io) or N API calls (others); 1 bulk upsert (24h market data); 1 bulk update (lastSyncedAt). Failed pairs: `trackSyncFailure` (single updates).

**Before vs after:**

- **Before:** Per pair: one API call, one DB upsert (or multiple writes). No “fresh” skip → same pairs synced every 15 min even if just synced.
- **After:** Gate.io: one batch request for all pairs on that exchange; all exchanges: one bulk upsert + one bulk lastSyncedAt update per exchange. Pairs synced in the last 5 min skipped. **Saves API calls (batch), DB round-trips (bulk), and redundant work (fresh skip).**

---

### 3.4 Exchange Sync 7d

**Purpose:** For each active token–exchange pair, fetch 7-day K-line (candlestick) data and store it for charts.

**Current flow:**

1. **Trigger:** Scheduler every 30 min (prod), first run at 0 min. Job: `exchange-sync-7d`.
2. **Read:** Same as 24h: `findAllActiveTokenExchanges()`, filter to stale (default `marketData7dFreshMinutes` = 10 min). `findAllActive()` for exchanges. Per pair: `adapter.fetchKline7d(exchange, symbol)` (no batch in current adapters).
3. **Write:** Rows collected per exchange (all candles for all pairs on that exchange); then one `bulkUpsertMarketData7d(rows7d)` and one `bulkUpdateLastSyncedAt(lastSyncedUpdates)` per exchange.

**Reads/writes:**

- Same pattern as 24h for DB; API: one call per pair (no batch for 7d in this codebase).
- Bulk write: one 7d bulk upsert + one lastSyncedAt bulk update per exchange.

**Before vs after:**

- **Before:** Typically one upsert per candle or per pair; all pairs every run.
- **After:** One bulk upsert (all 7d rows for that exchange) + one bulk lastSyncedAt per exchange; pairs with lastSuccessAt within 10 min skipped. **Fewer DB round-trips and no redundant sync for fresh pairs.**

---

### 3.5 Token Ranking

**Purpose:** Compute token rankings by market cap from the latest exchange market data and persist rank (and clear rank for tokens with no market data).

**Current flow:**

1. **Trigger:** Scheduler every 15 min (prod), first run after 3 min. Job: `token-ranking`.
2. **Read:** `tokensRepository.find({ ticker: 1 })` (lightweight); then `exchangesService.getAggregatedMarketDataBatch(allTokens)` — one batch read that aggregates market data (price, volume, market cap) per token identifier.
3. **Logic:** Filter to tokens with valid `marketCap` (and not unverified); sort by market cap descending; assign ranks (same market cap = same rank); build `rankUpdates` and list of ids to clear rank.
4. **Write:** `tokensRepository.bulkUpdateRanks(rankUpdates)`; if any ids without market data, `tokensRepository.clearRankForIds(idsToClearRank)`.

**Reads/writes:**

- 1 read: tokens (projection); 1 batch read: aggregated market data.
- 1 bulk update: ranks; 0 or 1 bulk clear: rank for ids without data.

**Before vs after:**

- **Before:** Could have been per-token reads and per-token rank updates.
- **After:** One batch read for market data, one bulk rank update, one optional bulk clear. **Constant, small number of DB operations per run.**

---

### 3.6 Floor Price Sync

**Purpose:** For tokens that do **not** have exchange market data, fetch floor price (and related fields) from Kasplex and store them so the app can show a price. Tokens that later get exchange data have floor cleared.

**Current flow:**

1. **Trigger:** Scheduler every 30 min (prod), first run after 6 min. Job: `floor-price-sync`.
2. **Read:**
   - `exchangesRepository.findTokensWithExchangeData()` → set of token identifiers that have exchange data.
   - `tokensRepository.findForFloorPriceSync()` → tokens needed for floor (targeted query).
   - For each token without exchange data: if floor already exists and is newer than `floorPriceStaleMs` (30 min), **skip**. Else call `floorPriceCalculator.calculateFloorPrice(identifier, decimals)` (Kasplex). If result unchanged from stored value, **skip**.
3. **Write:**
   - Identifiers that now have exchange data but had floor: `tokensRepository.updateByIdentifiers(..., { floorPriceUsd: null, ... })`.
   - Collected updates: one `tokensRepository.bulkUpdateFloorPrices(toUpdate)`.
   - Identifiers with no listings: clear floor via `updateByIdentifiers`.

**Reads/writes:**

- 1 read: tokens with exchange data; 1 read: tokens for floor sync.
- Per token (only if not skipped): 1 Kasplex call; updates collected in memory.
- 1 bulk update for floor prices; 0–2 bulk updates for clearing (exchange / no listings).

**Before vs after:**

- **Before:** Full token scan and per-token updates in many implementations.
- **After:** Targeted `findForFloorPriceSync`, skip stale (30 min) and unchanged, single `bulkUpdateFloorPrices`. **Fewer Kasplex calls and fewer DB writes.**

---

## 4. Infrastructure and Cross-Cutting Improvements

### 4.1 Redis / BullMQ

- **Detection:** Worker module uses `process.env.REDIS_HOST` (same as `redis.config.ts`) to decide whether to register BullMQ. Previously it used a bare `new ConfigService()`, which had no loaded config, so `get('redis')` was undefined and BullMQ was never registered; schedulers always ran “No Redis” and called processors directly.
- **Connection:** BullMQ connection options: `connectTimeout: 20000`, `retryStrategy` (up to 3 retries with backoff). Reduces ETIMEDOUT and “Connection is closed” on Redis Cloud or slow networks.

### 4.2 Holder Snapshot (Service + Repository)

- **Single upsert:** Repository uses one `findOneAndUpdate(..., { upsert: true, new: true })` instead of find + update or insert → 1 round-trip per doc when saving a single snapshot.
- **Percentage calculation:** One loop over up to 50 holders to compute top10/top20/top50 sums and percentages (no extra slices/reduces).
- **Bulk:** Service exposes `saveDailySnapshots(dataList)`; repository has `bulkUpsert(snapshots)` (Mongoose `bulkWrite` with `ordered: false`). Token Info Sync processor collects snapshot payloads per chunk and calls `saveDailySnapshots` once per chunk.

### 4.3 CoinEx Adapter

- **Market param:** CoinEx API v1 expects lowercase market (e.g. `burtusdt`). Ticker24h and Kline7d now pass `symbol.toLowerCase()` for the `market` parameter to avoid 400 Bad Request.

---

## 5. How to Test Improvements

- **Fast intervals:** Set `WORKER_FAST_TEST=1` and run in non-production. Intervals and first-run delays are shortened (see `worker.config.ts`: e.g. token sync 30 s, token info 45 s, exchange 24h 1 min, etc.) so you can see runs quickly.
- **Redis:** Set `REDIS_HOST` (and optionally port/password) so BullMQ is registered. Logs should show “Redis connected” and “BullMQ queue … ready” for each scheduler; jobs should be processed by BullMQ workers. Without `REDIS_HOST`, logs show “No Redis. Will run processor directly.”
- **Holder snapshot:** Run Token Info Sync (wait for first run or trigger manually). Check logs for “snapshots_bulk_saved” (debug) or absence of per-token snapshot errors. In DB, confirm one snapshot per ticker per day in holder snapshot collection.
- **Exchange 24h/7d:** Check logs for “Found X pairs to sync (Y skipped fresh)” after a few runs; Y should be > 0 when runs overlap. Confirm bulk writes (no per-pair write logs).
- **Token ranking:** After 24h sync has run, run token ranking; logs should show “ranked N, cleared rank for M” and a single batch of updates.
- **Floor price:** Run floor price sync; logs should show “updated X; … skipped (stale) Y, skipped (unchanged) Z” when re-running within 30 min or when values unchanged.

---

## 6. Config Reference (worker.config)

| Key | Default (prod) | Meaning |
|-----|----------------|---------|
| `sync.tokenSyncInterval` | 3600000 (1 h) | Token sync interval (ms). |
| `sync.tokenInfoSyncInterval` | 900000 (15 min) | Token info sync interval. |
| `sync.tokenInfoSyncNumWorkers` | 2 | Number of parallel chunks in token info sync. |
| `sync.marketData24hInterval` | 900000 (15 min) | Exchange 24h sync interval. |
| `sync.marketData7dInterval` | 1800000 (30 min) | Exchange 7d sync interval. |
| `sync.tokenRankingInterval` | 900000 (15 min) | Token ranking interval. |
| `sync.floorPriceSyncInterval` | 1800000 (30 min) | Floor price sync interval. |
| `marketData24hFreshMinutes` | 5 | Skip 24h sync for pair if lastSuccessAt within this many minutes. |
| `marketData7dFreshMinutes` | 10 | Skip 7d sync for pair if lastSuccessAt within this many minutes. |
| `floorPriceStaleMs` | 30 * 60 * 1000 | Only recalc floor if missing or older than this (ms). |
| `rateLimitBetweenExchangesMs` | 500 | Delay between processing one exchange and the next. |

With `WORKER_FAST_TEST=1` and `NODE_ENV !== 'production'`, intervals and initial delays are reduced for testing (see `worker.config.ts`).

---

This document reflects the current behavior and improvements as implemented. For runbooks and deployment, combine with your environment docs (Redis, MongoDB, Kasplex, exchange API keys).
