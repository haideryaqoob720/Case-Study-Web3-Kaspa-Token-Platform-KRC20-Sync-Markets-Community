# Exchange Market Data Integration - Implementation Plan

## Overview
Integrate exchange market data (24h ticker + 7d K-line) from 7 working exchanges into the backend, matching Kaspa Lens format.

## Working Exchanges
1. Gate.io
2. AscendEX
3. CoinEx
4. MEXC
5. BitMart
6. FameEX
7. XT.com

**Note:** Poloniex excluded - no tokens found during verification

## Phased Implementation Strategy

### Phase 1: Test with 20 Verified Tokens (First)
**Goal:** Implement and test with a small subset of tokens we already verified

**Tokens to Test (20 verified tokens):**
- KASMO, BITE, GECKO, KROAK, KANGO, Kasper, Konan, Keke, Ghoad, Burt, Krex, Kyro, PacMan, Bomo, Szar, TBDAI, MATRIX, ZEAL, SLOW, KASPY

**Why Start Small:**
- ✅ Test implementation with known working tokens
- ✅ Verify data accuracy and calculations
- ✅ Test API endpoints and response format
- ✅ Identify issues before scaling to all tokens
- ✅ Faster iteration and debugging

### Phase 2: Scale to All ~906 Tokens (After Phase 1 Success)
**Goal:** Expand to all verified token-exchange pairs

**After Phase 1 is verified:**
- ✅ All calculations correct (market cap, volume, 24h, 7d)
- ✅ API response matches Kaspa Lens format
- ✅ Background workers working correctly
- ✅ No errors in data fetching

**Then:** Enable full sync for all ~906 token-exchange pairs

## Implementation Steps

### Step 1: Database Schema & Migrations
**Goal:** Create normalized database tables for exchange data with proper relationships

**Tasks:**
- Create `exchanges` table (master exchange data)
- Create `token_exchanges` table (token-exchange mapping)
  - Foreign key: `token_identifier` → `tokens.identifier` (CASCADE)
  - Foreign key: `exchange_id` → `exchanges.id` (RESTRICT)
- Create `exchange_market_data_24h` table (24h ticker data)
  - Foreign key: `token_identifier` → `tokens.identifier` (CASCADE)
  - Foreign key: `exchange_id` → `exchanges.id` (RESTRICT)
- Create `exchange_market_data_7d` table (7d K-line data)
  - Foreign key: `token_identifier` → `tokens.identifier` (CASCADE)
  - Foreign key: `exchange_id` → `exchanges.id` (RESTRICT)
- Create `exchange_sync_log` table (audit/monitoring)
  - Foreign key: `exchange_id` → `exchanges.id` (RESTRICT)
- Create TypeORM entities for all tables with relationships
- Add indexes for performance
- Create migration SQL files
- **Test:** Verify foreign key constraints work, test cascade deletes, verify identifier relationships

**Table Relationships:**
```
tokens (existing)
  ↓ (1:N via identifier)
token_exchanges
  ↓ (N:1)
exchanges

tokens (existing)
  ↓ (1:N via identifier)
exchange_market_data_24h
  ↓ (N:1)
exchanges

tokens (existing)
  ↓ (1:N via identifier)
exchange_market_data_7d
  ↓ (N:1)
exchanges
```

**Deliverables:**
- 5 database tables created with proper foreign keys using identifier
- 5 TypeORM entities with relationships
- Migration files ready
- Foreign key constraints tested

**Commit:** `feat: add exchange market data database schema with identifier relationships`

---

### Step 2: Exchange Configuration & Adapters
**Goal:** Create exchange adapter system for API integration

**Tasks:**
- Create `ExchangeAdapter` interface
- Implement adapters for each exchange (Gate.io, AscendEX, CoinEx, MEXC, BitMart, FameEX, XT.com)
- Handle exchange-specific symbol formats
- Normalize API responses to common format
- Add retry logic and error handling
- Create exchange configuration service
- **Test:** Test each adapter with real API calls to exchanges, verify response parsing, test error handling, verify symbol format conversion

**Deliverables:**
- Exchange adapter interface
- 7 exchange adapter implementations
- Exchange configuration service
- All adapters tested with real exchange APIs

**Commit:** `feat: implement exchange API adapters with real API testing`

---

### Step 3: Exchange Service & Repository
**Goal:** Create service layer for exchange operations with accurate calculations

**Tasks:**
- Create `ExchangesRepository` (database operations using identifier)
- Create `ExchangesService` (business logic)
- Implement methods:
  - `getMarketData24h(identifier)` - Get 24h data for token
  - `getMarketData7d(identifier)` - Get 7d data for token
  - `aggregateMarketData(identifier)` - Aggregate across exchanges
  - `calculateMarketCap(price, maxSupply)` - Calculate market cap (Price × MaximumSupply)
  - `calculateVolume24h(marketData)` - SUM all exchange volumes
  - `calculateChange24h(marketData)` - Weighted average or best exchange
  - `calculateChange7d(klineData)` - From K-line: ((day7_close - day1_open) / day1_open) × 100
- Add data transformation to match Kaspa Lens format
- **Test:** Verify calculations are correct - Market Cap, Volume 24h, Change 24h, Change 7d, Price aggregation

**Deliverables:**
- ExchangesRepository (using identifier)
- ExchangesService
- Data aggregation logic with verified calculations
- All calculations tested for accuracy

**Commit:** `feat: add exchange service and repository layer with accurate calculations`

---

### Step 4: Populate Exchange & Token-Exchange Mapping
**Goal:** Initialize exchange data and token-exchange mappings (Phase 1: 20 tokens first)

**Tasks:**
- Create seed script to populate `exchanges` table
- Create script to populate `token_exchanges` from verification results
- **Phase 1:** Populate only 20 verified tokens first (KASMO, BITE, GECKO, KROAK, etc.)
- Map exchange codes to database IDs
- Set symbol formats per exchange
- Mark verified tokens
- Use `identifier` from tokens table for foreign key relationships
- **Test:** Verify all exchanges inserted, verify 20 token-exchange mappings match verification results, check foreign key relationships using identifier

**Deliverables:**
- Exchanges seeded (7 exchanges)
- Token-exchange mappings populated using identifier (20 tokens in Phase 1)
- ~20-50 token-exchang                                                                                                                                                                              e pairs inserted (Phase 1)
- Data verified against verification results

**Commit:** `feat: populate exchange and token-exchange mappings (phase 1: 20 tokens)`

**Note:** After Phase 1 testing is successful, we'll populate remaining ~906 tokens in Phase 2

---

### Step 5: Background Workers - 24h Data Sync
**Goal:** Create worker to sync 24h ticker data periodically (Phase 1: 20 tokens)

**Tasks:**
- Create `ExchangeSync24hProcessor` (BullMQ job processor)
- Implement rate limiting (200ms delay between calls)
- **Phase 1:** Fetch data only for 20 verified tokens from `token_exchanges` table
- Fetch 24h ticker data from each exchange using real APIs
- Store in `exchange_market_data_24h` table using identifier
- Handle errors gracefully
- Add retry logic with exponential backoff
- Create scheduler (every 1-5 minutes)
- **Test:** Manually trigger worker, verify data stored correctly for 20 tokens, verify price/volume/change24h values are accurate, test error handling, compare with actual exchange data

**Deliverables:**
- ExchangeSync24hProcessor
- Scheduler configuration
- Error handling and retry logic
- Worker tested with 20 tokens and data verified

**Commit:** `feat: add background worker for 24h market data sync (phase 1)`

**Note:** After Phase 1 verification, enable for all ~906 tokens

---

### Step 6: Background Workers - 7d Data Sync
**Goal:** Create worker to sync 7d K-line data periodically (Phase 1: 20 tokens)

**Tasks:**
- Create `ExchangeSync7dProcessor` (BullMQ job processor)
- Implement rate limiting (200ms delay)
- **Phase 1:** Fetch data only for 20 verified tokens from `token_exchanges` table
- Fetch 7d K-line data from each exchange using real APIs
- Store in `exchange_market_data_7d` table (one row per day) using identifier
- Calculate 7d price change: ((day7_close - day1_open) / day1_open) × 100
- Handle errors gracefully
- Create scheduler (every 15-30 minutes)
- **Test:** Manually trigger worker, verify 7 candles stored (7 rows) for 20 tokens, verify 7d change calculation is correct, test with real K-line data, compare with exchange data

**Deliverables:**
- ExchangeSync7dProcessor
- Scheduler configuration
- K-line data storage logic using identifier
- 7d change calculation verified for 20 tokens

**Commit:** `feat: add background worker for 7d K-line data sync (phase 1)`

**Note:** After Phase 1 verification, enable for all ~906 tokens

---

### Step 7: API Endpoints
**Goal:** Enhance token list API to include market data in Kaspa Lens format

**Tasks:**
- Enhance existing `GET /api/tokens` (list endpoint) to include market data
  - For each token in the list, include aggregated market data
  - Include per-exchange market data array
  - All in ONE API response matching Kaspa Lens format
- Use `identifier` to join with exchange tables
- Add DTOs for request/response validation
- Add Swagger documentation
- **Test:** Call API, verify response structure matches Kaspa Lens format, verify all calculations (price, volume, market cap, 24h, 7d) are correct, test with multiple tokens

**Response Structure (Kaspa Lens Format):**
```json
{
  "data": [
    {
      "ticker": "NACHO",
      "name": "Nacho Token",
      "MaximumSupply": "1000000000",
      "minted": "500000000",
      // ... all existing token fields ...
      "marketData": {
        "price": { "currency": {...}, "amount": 0.00001769 },
        "change24h": 1.03,
        "change7d": 41.89,
        "volume24h": { "currency": {...}, "amount": 88513.49 },
        "marketCap": { "currency": {...}, "amount": 5077029.71 },
        "marketCapUnverified": false,
        "veryLowVolume": false,
        "exchanges": [ /* per-exchange data array */ ]
      }
    }
  ],
  "pagination": { ... }
}
```

**Deliverables:**
- Enhanced `GET /api/tokens` with market data
- Response format matches Kaspa Lens exactly
- All calculations verified correct
- API tested end-to-end

**Commit:** `feat: enhance tokens list API with exchange market data`

---

### Step 8: Testing & Validation (Phase 1: 20 Tokens)
**Goal:** Final validation with 20 tokens before scaling

**Tasks:**
- Test API endpoints with 20 tokens (curl/Postman)
- Validate calculations for 20 tokens:
  - Market Cap = Price × MaximumSupply (verify with known tokens)
  - Volume 24h = SUM of exchange volumes (verify sum is correct)
  - Change 24h = Accurate percentage (verify calculation)
  - Change 7d = Accurate from K-line (verify day1 vs day7)
  - Price = Best price or weighted average (verify logic)
- Validate data matches Kaspa Lens format exactly
- Test error scenarios
- Performance testing (query speed)
- Compare with actual exchange data to verify accuracy
- **Phase 1 Verification:** All 20 tokens data is correct and matches exchange data

**Deliverables:**
- All calculations verified correct for 20 tokens
- Data validated against real exchange APIs
- Performance verified
- Response format matches Kaspa Lens exactly
- **Ready for Phase 2:** Scale to all ~906 tokens

**Commit:** `test: validate exchange integration with 20 tokens (phase 1)`

---

### Step 9: Scale to All Tokens (Phase 2)
**Goal:** Expand to all ~906 verified token-exchange pairs

**Tasks:**
- Populate remaining token-exchange mappings (~906 total)
- Enable background workers for all tokens
- Monitor sync performance and errors
- Verify data accuracy for all tokens
- **Test:** Spot check random tokens to ensure accuracy

**Deliverables:**
- All ~906 token-exchange pairs syncing
- Full production deployment
- Monitoring and error handling verified

**Commit:** `feat: scale exchange sync to all verified tokens (phase 2)`

---

### Step 10: Integration & Documentation
**Goal:** Final integration and documentation

**Tasks:**
- Integrate with existing token endpoints
- Update API documentation
- Add environment variables documentation
- Create README for exchange module
- Verify end-to-end flow
- Check data consistency

**Deliverables:**
- Fully integrated system
- Documentation updated
- Ready for production

**Commit:** `docs: update exchange integration documentation`

---

## Data Flow Summary

1. **Background Workers** sync data from exchanges → Database
2. **API Endpoints** query database → Aggregate data → Return JSON
3. **Frontend** receives JSON matching Kaspa Lens format

## Response Format (Kaspa Lens Compatible)

```json
{
  "marketData": [
    {
      "exchange": "GATE_IO",
      "exchangeLogoUrl": "...",
      "exchangeName": "Gate.io",
      "price": { "currency": {...}, "amount": 0.000020 },
      "open": { "currency": {...}, "amount": 0.000017 },
      "close": { "currency": {...}, "amount": 0.000020 },
      "high": { "currency": {...}, "amount": 0.000021 },
      "low": { "currency": {...}, "amount": 0.000019 },
      "priceChangePercent": 1.92,
      "quoteSymbol": "USDT",
      "timeRange": "HOURS_24",
      "volume": 892139721.0,
      "lastUpdated": "2026-01-05T11:45:05Z"
    }
  ],
  "price": { "currency": {...}, "amount": 0.00001769 },
  "change24h": 1.03,
  "change7d": 41.89,
  "volume24h": { "currency": {...}, "amount": 88513.49 },
  "marketCap": { "currency": {...}, "amount": 5077029.71 },
  "marketCapUnverified": false,
  "veryLowVolume": false
}
```

## Notes

- Rate limiting: 200ms delay between API calls
- Error handling: Continue on failure, log errors
- Data freshness: Track `last_updated` timestamps
- Aggregation: Volume = SUM, Price = best or weighted average
- Market Cap: Price × MaximumSupply from tokens table (MUST be accurate)
- 7d Change: Calculated from K-line data (day 1 open vs day 7 close) (MUST be accurate)
- 24h Change: From exchange ticker API (MUST be accurate)
- Volume 24h: SUM of all exchange volumes (MUST be accurate)
- Foreign Keys: Use `identifier` from tokens table (matches existing pattern)
- Testing: Test with real exchange APIs, not mocks
- API Response: Enhance `GET /api/tokens` list endpoint to include market data in Kaspa Lens format

## Data Accuracy Requirements

**Critical:** All calculations must be verified:
1. **Market Cap** = `Price × MaximumSupply` (from tokens table)
2. **Volume 24h** = `SUM(volume_24h)` across all exchanges
3. **Change 24h** = From exchange API or calculated: `((close - open) / open) × 100`
4. **Change 7d** = From K-line: `((day7_close - day1_open) / day1_open) × 100`
5. **Price** = Best price across exchanges or volume-weighted average

**Testing:** Each step includes testing to verify data accuracy before proceeding.

