#!/bin/bash
# Check PACMAN on AscendEX: Exchange API + Database
# Usage: ./scripts/check-pacman-ascendex.sh [mongodb_uri]
# Example: ./scripts/check-pacman-ascendex.sh "mongodb://localhost:27017/kaspamemes-dev"

set -e

echo "=========================================="
echo "1. AscendEX API - Products (verify PACMAN listed)"
echo "=========================================="
curl -s "https://ascendex.com/api/pro/v1/products" | grep -o '"PACMAN/USDT"' | head -1 && echo " ✅ PACMAN/USDT found" || echo " ❌ PACMAN/USDT NOT found"

echo ""
echo "=========================================="
echo "2. AscendEX API - 24h Ticker"
echo "=========================================="
curl -s "https://ascendex.com/api/pro/v1/ticker?symbol=PACMAN/USDT" | jq '.' 2>/dev/null || curl -s "https://ascendex.com/api/pro/v1/ticker?symbol=PACMAN/USDT"

echo ""
echo "=========================================="
echo "3. AscendEX API - 7d Klines (barhist)"
echo "=========================================="
end=$(date +%s)000
start=$((end - 7*24*60*60*1000))
curl -s "https://ascendex.com/api/pro/v1/barhist?symbol=PACMAN/USDT&interval=1d&from=$start&to=$end" | jq '.data | length' 2>/dev/null && echo " candles returned" || curl -s "https://ascendex.com/api/pro/v1/barhist?symbol=PACMAN/USDT&interval=1d&from=$start&to=$end"

echo ""
echo "=========================================="
echo "4. Database (MongoDB)"
echo "=========================================="
MONGO_URI="${1:-mongodb://localhost:27017/kaspamemes-dev}"
echo "Using: $MONGO_URI"
echo ""

# token_exchanges
echo "--- token_exchanges (PACMAN + AscendEX) ---"
mongosh "$MONGO_URI" --quiet --eval '
const ex = db.exchanges.findOne({ code: "ascendex" });
if (!ex) { print("❌ AscendEX not found in exchanges"); quit(1); }
const te = db.token_exchanges.findOne({ tokenIdentifier: "PACMAN", exchangeId: String(ex._id) });
if (te) { print("✅ PACMAN on AscendEX in token_exchanges"); printjson(te); }
else { print("❌ PACMAN NOT in token_exchanges for AscendEX"); }
' 2>/dev/null || echo "Run manually: mongosh $MONGO_URI"

# exchange_market_data_24h
echo ""
echo "--- exchange_market_data_24h (PACMAN) ---"
mongosh "$MONGO_URI" --quiet --eval '
const ex = db.exchanges.findOne({ code: "ascendex" });
if (!ex) { print("AscendEX not found"); quit(1); }
const d24 = db.exchange_market_data_24h.findOne({ tokenIdentifier: "PACMAN", exchangeId: String(ex._id) });
if (d24) { print("✅ 24h data found"); print("  price:", d24.price, "volume24h:", d24.volume24h, "change24h:", d24.change24h + "%"); print("  lastUpdated:", d24.lastUpdated); }
else { print("❌ No 24h market data for PACMAN on AscendEX"); }
' 2>/dev/null || echo "Run manually: mongosh $MONGO_URI"

# exchange_market_data_7d
echo ""
echo "--- exchange_market_data_7d (PACMAN) ---"
mongosh "$MONGO_URI" --quiet --eval '
const ex = db.exchanges.findOne({ code: "ascendex" });
if (!ex) { print("AscendEX not found"); quit(1); }
const count = db.exchange_market_data_7d.countDocuments({ tokenIdentifier: "PACMAN", exchangeId: String(ex._id) });
print(count > 0 ? "✅ " + count + " 7d candles" : "❌ No 7d candles");
if (count > 0) {
  const sample = db.exchange_market_data_7d.find({ tokenIdentifier: "PACMAN", exchangeId: String(ex._id) }).sort({ date: -1 }).limit(2);
  sample.forEach(d => print("  ", d.date, "close:", d.close));
}
' 2>/dev/null || echo "Run manually: mongosh $MONGO_URI"

echo ""
echo "Done."
