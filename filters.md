
Here’s a **plan-only** summary of logic and data for each filter (no implementation).

---

# Filter implementation plan (logic only)

## Current data (backend)

- **Token:** `ticker`, `identifier`, `maxSupply`, `minted`, `burned`, `preAllocated`, `holderCount`, `mintCount`, `mtsAdd`, `state`, `rank`, etc.
- **Market (from exchanges):** `change24h`, `change7d`, `volume24h`, `marketCap` (aggregated).
- **Existing filters:** `premint` (yes/no/all via `preAllocated`), `supplySort`, `ageSort`, `minting` %, `topGainers`, `topLosers`, `trending`, `voteSort`.

---

## 1. KRC-20

**Client:** Show only assets where protocol = KRC-20.

**Logic:**

- If **all tokens in the DB are KRC-20** (e.g. only Kasplex/Kaspa tokens): this is a **no-op** (show all) or a UI-only label.
- If you will support **multiple protocols later**: add a `protocol` (or `chain`) field to the token schema and seed it (e.g. `"KRC-20"` for current tokens). Filter: `protocol === 'KRC-20'`.

**Data:** Today no protocol field; either assume all are KRC-20 or add the field and backfill.

---

## 2. Market Tokens (“Blue chip”)

**Client:** High liquidity, listed on top-tier aggregators/exchanges.

**Logic:**

- **Option A (exchange list):** Use `token-exchanges.config` (or a “top exchanges” list). Include only tokens that are listed on at least one of the configured “top-tier” exchanges (e.g. Gate.io, MEXC, etc.). Requires a clear list of which exchanges count as “market”.
- **Option B (liquidity/volume):** Require `volume24h >= X` and/or `marketCap >= Y` (e.g. “large cap” threshold). Same as “high liquidity” in practice.
- **Option C:** Combine: listed on ≥ N top exchanges **and** min volume/mcap.

**Data:** You have exchange list per token (from token–exchange mapping) and aggregated `volume24h` / `marketCap`. No “blue chip” flag; define it via exchange list and/or thresholds.

---

## 3. Top Today

**Client:** Biggest movers in last 24h (gainers or volume leaders). Sort by Price Change % (24h) or Trading Volume (24h) desc.

**Logic:**

- **Backend:** Reuse/extend existing “market data pool” pattern (like top gainers/trending).
  - **Variant A – by 24h change:** Sort by `change24h` descending (same idea as top gainers; optionally relax min volume/cap so “top today” is broader).
  - **Variant B – by 24h volume:** Sort by `volume24h` descending.
  - **Variant C – combined:** One mode “Top today by gain”, another “Top today by volume”, or a single list with a secondary sort (e.g. by volume then by change).
- Apply a **minimum bar** (e.g. `volume24h >= 5k`) so tiny/dust pairs don’t dominate.

**Data:** `change24h` and `volume24h` from aggregated market data. No new fields needed.

---

## 4. Top All Time

**Client:** Highest valuation or performance since inception. Filter/sort by ATH or total ROI.

**Logic:**

- **ATH:** Need “all-time high price” per token. Options:
  - Store `athPrice` (and optionally `athDate`) in DB, updated by a job that computes or receives ATH (e.g. from exchange/Coingecko or from your own 7d/24h history).
  - Or approximate: use max of (current price, 7d high) until you have real ATH.
- **ROI:** Need “price at launch” (or first known price) and current price; ROI = (current - launch) / launch. Requires storing or computing “launch price” and/or ROI.
- **Sort:** By `athPrice` desc, or by ROI desc, with optional min volume/mcap filter.

**Data:** Today you have current price and 7d data; you do **not** have ATH or ROI. Need either new stored fields + a sync job, or an external ATH/ROI API.

### Research: How to get ATH price and launch price

**ATH (all-time high)**

| Source | How | Limitations |
|--------|-----|-------------|
| **CoinGecko** | `GET /coins/{id}` with `market_data=true`. Response: `market_data.ath.usd`, `market_data.ath_date.usd` (and other currencies). | KRC-20 / Kaspa meme tokens are generally **not** listed on CoinGecko; only mainstream coins. Use only if you add support for coins that are on CoinGecko. |
| **Your own history** | Compute from stored OHLC: ATH = max(high) over all candles. You already have 7d daily candles in `exchange_market_data_7d` (per exchange, per token, per day). A sync job can either (1) take max of `high` across all 7d rows per token, or (2) fetch longer history from exchanges and then compute max. | 7d table only has the history you’ve been storing; for “true” ATH you need data back to listing. |
| **Exchange APIs** | Gate.io, MEXC, etc. expose candlestick (OHLC) endpoints. Fetch candles from as far back as possible (e.g. Gate.io allows up to **10,000 points** per request; for 1d interval that’s ~27 years). ATH = max(high) over all returned candles. | Per-exchange; need to aggregate if token is on multiple exchanges. Gate.io: `GET /api/v4/spot/candlesticks?currency_pair=X_USDT&interval=1d&from=...&to=...` (max 10k points). |
| **Approximation (no new data)** | ATH ≈ max(current price, 7d high). Use your existing 24h/7d aggregated high (e.g. best exchange’s `high24h` or max of 7d `high`). Quick to implement, improves as you add more history. | Understates true ATH until you have long history. |

**Launch price (for ROI)**

| Source | How | Limitations |
|--------|-----|-------------|
| **No standard API** | There is no universal “launch price” API for arbitrary tokens. Exchanges and CoinGecko do not expose a dedicated “first price” or “listing price” field. | Must be derived. |
| **Your 7d data** | **First known price:** Take the **oldest** candle per token from `exchange_market_data_7d` (or 24h table), ordered by `date` asc. Use that candle’s `open` (or `close`) as “launch price”. ROI = (currentPrice - launchPrice) / launchPrice. | Only as far back as you’ve been storing data; “launch” is really “first recorded price in our DB”. |
| **Token deploy time** | You have `mtsAdd` (deploy timestamp) on tokens. “Launch price” could be defined as the open/close of the **first candle after** `mtsAdd` (or after exchange listing, if you track that). Requires matching candle dates to deploy/list date. | Listing date may differ from deploy date; need to decide definition. |
| **CoinGecko** | For coins that are on CoinGecko: `GET /coins/{id}/market_chart/range?vs_currency=usd&from={ts}&to={ts}`. Use the **first** price in the series as proxy for “first known price”. | KRC-20 meme tokens typically not on CoinGecko. |

**Recommended approach for this codebase**

1. **ATH**
   - **Short term:** Approximate ATH = max(current price, 7d high) using existing aggregated market data (no new DB fields). Good enough for “Top All Time” sort until you have more history.
   - **Medium term:** Add a job that (a) fetches historical candlesticks from Gate.io (and optionally MEXC) for each listed token from listing date, (b) stores daily high (or reuse 7d table), (c) writes `athPrice` and optionally `athDate` to a token metadata table or token document. Then sort by `athPrice` desc.

2. **Launch price / ROI**
   - Use “first known price” from your own data: query `exchange_market_data_7d` (or 24h) for token, order by date asc, take first row’s `open` (or `close`) as launch price. Store it as `launchPrice` or compute on the fly for the “Top All Time” list. ROI = (current - launchPrice) / launchPrice.
   - Optionally store `launchPrice` and `launchPriceDate` in DB and update via job so you don’t recompute every time.

---

## 5. Pre Sale

**Client:** Tokens in fundraising stage – status “Upcoming” or “ICO/IDO”.

**Logic:**

- Filter tokens where `status` (or `launchPhase`) is one of: `Upcoming`, `ICO`, `IDO`, or similar.
- Optionally require “not yet fully minted” or “no/main exchange listing” to avoid mixing with live markets.

**Data:** No dedicated `launchPhase` or `status` enum in current token schema. You can still implement Pre Sale using existing data and/or optional APIs.

### Research: Do we have status? Can we do Pre Sale without it?

**What the codebase already has**

- **`state`** – The token schema has `state` (string, default `'active'`). It is **synced from Kasplex**: when we call `api.kasplex.org/v1/krc20/tokenlist`, each token has a `state` field that we map and store. So “status” in the sense of a single lifecycle field **does exist**; we just don’t know the exact set of values Kasplex sends (e.g. `active`, `upcoming`, `presale`, etc.). To find out: log a sample of `state` from the Kasplex response in your sync job, or call the tokenlist endpoint once and inspect.
- **Premint / mint progress** – We have `preAllocated`, `minted`, `maxSupply`. So “has premint” and “not 100% minted” are already available.
- **Exchange listing** – We have `tokenExchangeMap` (token → list of exchange codes). Tokens **not** in that map have no CEX listing in our system. So “no exchange listing” is a simple lookup.

**Does Kasplex (or any API) return “presale” / “upcoming”?**

| Source | What it returns | Notes |
|--------|------------------|--------|
| **Kasplex** (`api.kasplex.org/v1/krc20/tokenlist`) | **`state`** (string) per token. We already sync it into `token.state`. | Public docs do not list allowed values. You need to **inspect real responses** (e.g. log unique `state` values during sync) to see if they use e.g. `upcoming`, `presale`, `active`, etc. If they do, Pre Sale filter = “where state in (…)”. |
| **Kas.fyi** (Kaspa Developer Platform) | **`status`** (string) in `GET /v1/tokens/krc20/{ticker}/metadata`. Response includes `status` and full token metadata. | Different API (api.kas.fyi); may require API key. Good second source if you want a dedicated “status” field; you’d need to poll or sync this per token and store `status` (or use it only for detail page). |
| **Manual / admin list** | You maintain a list of tickers (or token IDs) that are “Pre Sale”. | Full control; no dependency on Kasplex/kas.fyi semantics. Can be a DB table or config list. |

**Yes, you can do Pre Sale without any new API**

Use a **convention (proxy)** based on data you already have:

1. **Proxy definition (example)**  
   “Pre Sale” = token has **no exchange listing** in our `tokenExchangeMap` **and** at least one of:
   - not 100% minted (minted &lt; maxSupply), or  
   - has premint (preAllocated &gt; 0).  

   Optionally narrow further (e.g. “no listing + premint only” or “no listing + minted &lt; 50%”) to avoid including every new token.

2. **Implementation**  
   - Add a query param e.g. `preSale=true`.  
   - When `preSale=true`: in the token list flow, restrict to tokens that are **not** in `tokenExchangeMap` (or not in any of your tracked exchanges) **and** satisfy your chosen mint/premint rule (e.g. premint &gt; 0 or minted &lt; maxSupply).  
   - No new DB fields required if you compute this on the fly; or add a stored `isPresale` (or `launchPhase`) and update it in a job that applies the same rules.

3. **If Kasplex exposes presale/upcoming in `state`**  
   - After you confirm the actual `state` values (e.g. `upcoming`, `presale`), you can add a second branch: “Pre Sale” = `state` in those values **or** the proxy above. That way you combine API-driven status with your own convention.

**Recommendation**

- **Short term:** Implement Pre Sale as a **proxy**: no exchange listing + (has premint or not 100% minted). No new APIs or schema changes.  
- **Next step:** Log or inspect Kasplex `state` values; if they include presale/upcoming, add `state in (...)` to the filter and optionally show “Pre Sale” only when state or proxy matches.  
- **Optional:** If you need a single “status” for the UI, add a sync from kas.fyi metadata (`status`) or an admin list and store it (e.g. `launchPhase` or `status`) so the backend has one source of truth.

---

## 6. Market Cap

**Client:** Filter by cap brackets (e.g. Large / Mid / Small).

**Logic:**

- Define brackets in config or DB, e.g.:
  - Large: `marketCap >= X` (e.g. $10M+),
  - Mid: `Y <= marketCap < X` (e.g. $1M–$10M),
  - Small: `marketCap < Y` (e.g. &lt; $1M).
- **Backend:** Add a query param e.g. `marketCapBracket=large|mid|small`. Filter (and optionally sort) by `marketCap` using these ranges. Use aggregated `marketCap` from market data; tokens without market data can be “Unlisted” or excluded from bracket filters.

**Data:** `marketCap` from aggregated market data. No new fields; only thresholds and query param.

---

## 7. Most Viewed

**Client:** “Trending in the last 24 hours” to keep the list fresh.

**Logic:**

- **Option A – reuse Trending:** Treat “Most Viewed” as the same as (or a variant of) your existing **Trending** score (volume + change + holder growth, etc.). Same backend as trending, possibly different label or slight weight change (e.g. more weight on 24h volume/change).
- **Option B – real view count:** If you have (or add) **view/click** events per token in the last 24h, compute a “view count” or “popularity” metric and sort by that. Requires event ingestion and storage (e.g. `token_views` table or analytics pipeline).

**Data:** Either existing trending score (no new data) or new view-tracking pipeline.

---

## 8. Fair Launch

**Client:** Only tokens where 100% of supply was available for public mint (no VC/team pre-alloc). Rule: no pre/reserved at deploy; verify max supply = total available for public mint (e.g. via Kasplex `/v1/krc20/token/{ticker}`).

**Logic:**

- **Backend (DB):**  
  - `preAllocated == 0` (or equivalent “no premint” check in your units).  
  - Optionally: “minted == maxSupply” if you want to restrict to “fully minted” fair launches only; otherwise “fair” = no pre-alloc, regardless of current minted.
- **Verification (Kasplex):** In sync or a separate check: call Kasplex token endpoint and ensure there is no pre/reserved &gt; 0; and that max supply matches “total available for public mint” (as per their docs). Use that to set/validate a `fairLaunch: boolean` flag or to derive the filter from `preAllocated` and supply.

**Data:** You already have `preAllocated` and premint filter. Fair Launch = strict “no premint” (preAllocated == 0) plus optional Kasplex-based verification and/or `fairLaunch` flag.

---

## 9. Recently Added

**Client:** Newest tokens (by deployment/list time).

**Logic:**

- Sort by `mtsAdd` descending (newest first). Optionally filter “added in last N days” (e.g. `mtsAdd >= now - 7d`).

**Data:** `mtsAdd` exists. This is already covered by your “By Age” / `ageSort=newest`; expose as “Recently Added” in the UI and optionally add a “last 7d” variant with a date filter.

---

## 10. Pre Sale (duplicate)

Same as **§5**. One plan for “Pre Sale” is enough; implement once and wire to the same filter.

---

## 11. Holders

**Client:** Filter/sort by number of holders.

**Logic:**

- **Sort:** By `holderCount` descending (or ascending for “fewest holders”).
- **Filter (optional):** e.g. “min holders” (e.g. `holderCount >= 100`) to avoid dust; or brackets (e.g. “1k+”, “10k+”) via query param.

**Data:** `holderCount` exists. No new fields; only sort and optional min/bracket filters.

---

## 12. Market Cap (filters)

Same as **§6**. One plan for “Market Cap filters” (brackets + optional sort).

---

# Summary table

| Filter           | Logic summary                                      | Data status                          |
|-----------------|----------------------------------------------------|--------------------------------------|
| **KRC-20**      | protocol === 'KRC-20' (or no-op if all are KRC-20) | No protocol field; add or assume     |
| **Market Tokens** | Top exchanges and/or min liquidity/mcap          | Have exchange list + volume/mcap     |
| **Top Today**   | Sort by change24h or volume24h desc, min bar        | Have change24h, volume24h            |
| **Top All Time**| Sort by ATH or ROI                                 | Need ATH/ROI or launch price         |
| **Pre Sale**    | status in (Upcoming, ICO, IDO)                      | No status field; need source         |
| **Market Cap**  | Bracket filters (large/mid/small) on marketCap      | Have marketCap                       |
| **Most Viewed** | Trending-in-24h score or view count                | Have trending; view count optional   |
| **Fair Launch** | preAllocated == 0 (+ optional Kasplex check)       | Have preAllocated; verification optional |
| **Recently Added** | Sort by mtsAdd desc, optional “last N days”     | Have mtsAdd                          |
| **Holders**     | Sort/filter by holderCount                         | Have holderCount                     |

---

# Suggested implementation order

1. **No new data:** Recently Added (wire to ageSort), Holders (sort/filter), Market Cap (brackets), Fair Launch (preAllocated == 0), KRC-20 (no-op or protocol field).
2. **Use existing market data:** Top Today (change24h/volume24h), Market Tokens (exchange + liquidity thresholds), Most Viewed (reuse/adapt trending).
3. **New data or external source:** Pre Sale (status/launch phase), Top All Time (ATH/ROI or launch price), and optional Fair Launch verification via Kasplex.

If you tell me which filters you want to implement first (e.g. “only those with current data”), I can turn this into a step-by-step backend + frontend plan (still no code).