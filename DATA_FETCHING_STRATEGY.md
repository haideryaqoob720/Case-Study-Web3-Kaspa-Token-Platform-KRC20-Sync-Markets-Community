# Data Fetching Strategy for Exchange Market Data

## Overview
This document explains how we'll fetch 24h ticker and 7d K-line data from exchanges.

## Current Situation
- **~2111 tokens** in database
- **~906 token-exchange pairs** (verified tokens on exchanges)
- **7 exchanges** to fetch from
- **2 data types:** 24h ticker + 7d K-line

## Phased Implementation

### Phase 1: Test with 20 Verified Tokens (First)
**Tokens:** KASMO, BITE, GECKO, KROAK, KANGO, Kasper, Konan, Keke, Ghoad, Burt, Krex, Kyro, PacMan, Bomo, Szar, TBDAI, MATRIX, ZEAL, SLOW, KASPY

**Why:** Test implementation, verify accuracy, identify issues before scaling

### Phase 2: Scale to All ~906 Tokens (After Phase 1 Success)
**After Phase 1 verified:** Enable full sync for all verified token-exchange pairs

---

## Strategy: Token-Based Fetching (Only Verified Tokens)

### **Key Principle: Only Fetch What We Know Exists**

We already know which tokens are on which exchanges from verification results. We store this in `token_exchanges` table.

**Approach:**
1. **Query `token_exchanges` table** → Get list of verified token-exchange pairs
   - **Phase 1:** Only 20 verified tokens (~20-50 pairs)
   - **Phase 2:** All ~906 pairs
2. **For each pair:** Fetch data ONLY for that specific token on that exchange
3. **Store data** in database

**Why This Is Better:**
- ✅ **Efficient:** Only fetch ~906 API calls (not thousands)
- ✅ **Precise:** No unnecessary data fetching
- ✅ **Fast:** We know exactly what to fetch
- ✅ **Rate limit friendly:** Controlled number of calls

---

### **For 24h Ticker Data: Token-Based Fetching**

**Approach:**
1. **Get verified token-exchange pairs** from `token_exchanges` table
2. **For each pair:** Fetch 24h ticker data for that specific token
3. **Store data** in `exchange_market_data_24h` table

**Example Flow:**
```
1. Query token_exchanges table:
   SELECT * FROM token_exchanges;
   Result: ~906 rows (e.g., NACHO on Gate.io, NACHO on AscendEX, etc.)

2. For each row:
   - Token: NACHO
   - Exchange: Gate.io
   - Symbol: "NACHO_USDT"
   
   API Call: GET /api/v4/spot/ticker?symbol=NACHO_USDT
   Response: { price, volume24h, change24h, high24h, low24h, open24h, close24h }
   
   Store in exchange_market_data_24h:
   - token_identifier: "NACHO"
   - exchange_id: 1 (Gate.io)
   - price, volume_24h, change_24h, etc.

3. Rate limit: 200ms delay between calls
```

**API Calls:** 
- **Phase 1:** ~20-50 calls (20 tokens)
- **Phase 2:** ~906 calls (all verified tokens)

**Time:** 
- **Phase 1:** ~4-10 seconds (20-50 × 200ms)
- **Phase 2:** ~3 minutes (906 × 200ms)

**Frequency:** Every 1-5 minutes

---

### **For 7d K-line Data: Token-Based Fetching**

**Approach:**
1. **Get verified token-exchange pairs** from `token_exchanges` table
2. **For each pair:** Fetch 7d K-line data for that specific token
3. **Store 7 candles** (one per day) in database

**Example Flow:**
```
1. Query token_exchanges table:
   SELECT * FROM token_exchanges;
   Result: ~906 rows

2. For each row:
   - Token: NACHO
   - Exchange: Gate.io
   - Symbol: "NACHO_USDT"
   
   API Call: GET /api/v4/spot/candlesticks?symbol=NACHO_USDT&interval=1d&limit=7
   Response: [7 candles for last 7 days]
   
   Store 7 rows in exchange_market_data_7d (one per day):
   - Day 1: open, high, low, close, volume
   - Day 2: open, high, low, close, volume
   - ... (7 days total)
   
   Calculate 7d change: ((day7_close - day1_open) / day1_open) × 100

3. Rate limit: 200ms delay between calls
```

**API Calls:** 
- **Phase 1:** ~20-50 calls (20 tokens)
- **Phase 2:** ~906 calls (all verified tokens)

**Time:** 
- **Phase 1:** ~4-10 seconds (20-50 × 200ms)
- **Phase 2:** ~3 minutes (906 × 200ms)

**Frequency:** Every 15-30 minutes

---

## Detailed Implementation

### Step 1: 24h Ticker Sync Worker

```typescript
// Pseudo-code for 24h sync
async sync24hTickerData() {
  // 1. Get ONLY verified token-exchange pairs from database
  const tokenExchangePairs = await getTokenExchangePairs(); // ~906 pairs
  
  for (const pair of tokenExchangePairs) {
    try {
      const exchange = await getExchange(pair.exchange_id);
      const token = await getToken(pair.token_identifier);
      
      // 2. Fetch 24h ticker data for THIS specific token
      const tickerData = await exchangeAdapter.fetchTicker24h(
        exchange,
        pair.exchange_symbol // e.g., "NACHO_USDT"
      );
      
      // 3. Store data
      await store24hData({
        token_identifier: pair.token_identifier,
        exchange_id: pair.exchange_id,
        price: tickerData.last,
        volume_24h: tickerData.quoteVolume,
        change_24h: tickerData.priceChangePercent,
        high_24h: tickerData.high24h,
        low_24h: tickerData.low24h,
        open_24h: tickerData.open24h,
        close_24h: tickerData.last,
        last_updated: new Date()
      });
      
    } catch (error) {
      logError(pair, error);
      continue; // Continue to next pair
    }
    
    // Rate limit: 200ms delay between calls
    await delay(200);
  }
}
```

**API Calls:** 
- **Phase 1:** ~20-50 calls (20 tokens)
- **Phase 2:** ~906 calls (all verified tokens)

**Time:** 
- **Phase 1:** ~4-10 seconds (20-50 × 200ms)
- **Phase 2:** ~3 minutes (906 × 200ms)

**Frequency:** Every 1-5 minutes

---

### Step 2: 7d K-line Sync Worker

```typescript
// Pseudo-code for 7d sync
async sync7dKlineData() {
  // 1. Get ONLY verified token-exchange pairs from database
  const tokenExchangePairs = await getTokenExchangePairs(); // ~906 pairs
  
  for (const pair of tokenExchangePairs) {
    try {
      const exchange = await getExchange(pair.exchange_id);
      
      // 2. Fetch 7d K-line for THIS specific token
      const klines = await exchangeAdapter.fetchKlines(
        exchange,
        pair.exchange_symbol, // e.g., "NACHO_USDT"
        '1d',
        7
      );
      
      // 3. Store 7 candles (one per day)
      for (const candle of klines) {
        await store7dData({
          token_identifier: pair.token_identifier,
          exchange_id: pair.exchange_id,
          date: candle.timestamp,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume
        });
      }
      
      // 4. Calculate 7d change
      const change7d = calculate7dChange(klines[0].open, klines[6].close);
      await update7dChange(pair.token_identifier, pair.exchange_id, change7d);
      
    } catch (error) {
      logError(pair, error);
      continue; // Continue to next pair
    }
    
    // Rate limit: 200ms delay between calls
    await delay(200);
  }
}
```

**API Calls:** 
- **Phase 1:** ~20-50 calls (20 tokens)
- **Phase 2:** ~906 calls (all verified tokens)

**Time:** 
- **Phase 1:** ~4-10 seconds (20-50 × 200ms)
- **Phase 2:** ~3 minutes (906 × 200ms)

**Frequency:** Every 15-30 minutes

---

## Symbol Storage Strategy

### Exchange Symbol Formats
Exchanges use different symbol formats:
- Gate.io: `NACHO_USDT`
- AscendEX: `NACHO/USDT`
- CoinEx: `NACHOUSDT`
- MEXC: `NACHOUSDT`

### Solution
Store exchange-specific symbol format in `token_exchanges` table:

```sql
token_exchanges:
  - token_identifier: "NACHO"  -- FK to tokens.identifier
  - exchange_id: 1            -- FK to exchanges.id
  - exchange_symbol: "NACHO_USDT"  -- Exchange-specific format (used in API calls)
  - base_currency: "USDT"
  - is_active: true
  - verified_at: timestamp
```

**Usage:**
1. Query `token_exchanges` to get verified pairs
2. Use `exchange_symbol` directly in API calls (no matching needed)
3. Use `token_identifier` for foreign key relationships

---

## Error Handling & Retry Logic

### For 24h Sync (Bulk Fetch)
- **Retry:** 3 attempts with exponential backoff (5s, 10s, 20s)
- **On failure:** Log error, continue to next exchange
- **Partial success:** Store successfully matched tokens, skip failures

### For 7d Sync (Individual Fetch)
- **Retry:** 3 attempts per pair with exponential backoff
- **On failure:** Log error, continue to next pair
- **Skip rate-limited:** If 429 error, wait longer before retry

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────┐
│  Database: token_exchanges table                        │
├─────────────────────────────────────────────────────────┤
│  ~906 verified token-exchange pairs                     │
│  (e.g., NACHO on Gate.io, NACHO on AscendEX, etc.)     │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Background Workers (BullMQ)                            │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  24h Sync Worker (Every 1-5 min)                         │
│  ┌──────────────────────────────────────┐              │
│  │ Query token_exchanges (~906 pairs)    │              │
│  │ For each pair:                         │              │
│  │  1. Fetch ticker (1 API call)         │              │
│  │  2. Store in exchange_market_data_24h │              │
│  │  3. Rate limit: 200ms delay           │              │
│  └──────────────────────────────────────┘              │
│                                                          │
│  7d Sync Worker (Every 15-30 min)                       │
│  ┌──────────────────────────────────────┐              │
│  │ Query token_exchanges (~906 pairs)    │              │
│  │ For each pair:                         │              │
│  │  1. Fetch 7d K-line (1 API call)      │              │
│  │  2. Store 7 candles                   │              │
│  │  3. Calculate 7d change                │              │
│  │  4. Rate limit: 200ms delay            │              │
│  └──────────────────────────────────────┘              │
│                                                          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  Database Tables                                        │
├─────────────────────────────────────────────────────────┤
│  • exchange_market_data_24h (price, volume, change24h)  │
│  • exchange_market_data_7d (7 candles per pair)         │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│  API Endpoint: GET /api/tokens                           │
├─────────────────────────────────────────────────────────┤
│  • Query tokens + join exchange data                    │
│  • Aggregate across exchanges                           │
│  • Calculate market cap, volume, changes                 │
│  • Return Kaspa Lens format                             │
└─────────────────────────────────────────────────────────┘
```

---

## Performance Estimates

### Phase 1: 20 Tokens (Testing)

**24h Sync:**
- **API Calls:** ~20-50 (one per verified token-exchange pair)
- **Time:** ~4-10 seconds (20-50 × 200ms delay)
- **Frequency:** Every 1-5 minutes

**7d Sync:**
- **API Calls:** ~20-50 (one per verified token-exchange pair)
- **Time:** ~4-10 seconds (20-50 × 200ms delay)
- **Frequency:** Every 15-30 minutes

**Total API Load (Phase 1):**
- **24h:** ~240-3,000 calls/hour (20-50 calls × 12-60 times/hour)
- **7d:** ~40-200 calls/hour (20-50 calls × 2-4 times/hour)
- **Total:** ~280-3,200 calls/hour

### Phase 2: All ~906 Tokens (Production)

**24h Sync:**
- **API Calls:** ~906 (one per verified token-exchange pair)
- **Time:** ~3 minutes (906 × 200ms delay)
- **Frequency:** Every 1-5 minutes

**7d Sync:**
- **API Calls:** ~906 (one per verified token-exchange pair)
- **Time:** ~3 minutes (906 × 200ms delay)
- **Frequency:** Every 15-30 minutes

**Total API Load (Phase 2):**
- **24h:** ~10,872-54,360 calls/hour (906 calls × 12-60 times/hour)
- **7d:** ~1,812-3,624 calls/hour (906 calls × 2-4 times/hour)
- **Total:** ~12,684-57,984 calls/hour across all exchanges
- **Per Exchange:** ~1,812-8,283 calls/hour (distributed across 7 exchanges)

**Note:** Rate limits vary by exchange. Most allow 100-1000 calls/minute, so this is well within limits.

---

## Summary

✅ **Approach:** Token-based fetching (only verified tokens from `token_exchanges` table)
✅ **24h Data:** Fetch individual ticker for each verified token-exchange pair (~906 calls)
✅ **7d Data:** Fetch individual K-line for each verified token-exchange pair (~906 calls)
✅ **Efficiency:** Only fetch what we know exists (no unnecessary API calls)
✅ **Symbol Storage:** Store exchange-specific formats in `token_exchanges.exchange_symbol`
✅ **Rate Limiting:** 200ms delay between calls, exponential backoff on errors
✅ **Error Handling:** Continue on failure, log errors, partial success OK

**Key Advantage:** We only fetch data for tokens we already verified exist on exchanges. No bulk fetching or matching needed - we know exactly what to fetch!

