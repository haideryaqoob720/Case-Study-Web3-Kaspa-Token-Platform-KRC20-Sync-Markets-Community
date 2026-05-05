#!/usr/bin/env bash
# Test exchange kline APIs with limit=24 (24 daily candles) for 7d chart.
# Run from repo root: ./scripts/test-7d-klines-curl.sh
# Symbol examples: NACHO (Gate/Pionex/CoinEx/AscendEX), use exchange-specific format.

set -e
SYMBOL="${1:-NACHO_USDT}"
SYMBOL_NOSEP="${SYMBOL//_/}"
SYMBOL_UPPER="${SYMBOL_NOSEP^^}"
SYMBOL_LOWER="${SYMBOL_NOSEP,,}"

echo "=== Testing 7d klines with limit=24 (symbol: $SYMBOL / $SYMBOL_UPPER) ==="

echo ""
echo "--- Gate.io (currency_pair=$SYMBOL, interval=1d, limit=24) ---"
curl -s "https://api.gateio.ws/api/v4/spot/candlesticks?currency_pair=$SYMBOL&interval=1d&limit=24" | head -c 500
echo ""

echo ""
echo "--- Pionex (symbol=$SYMBOL_UPPER, interval=1D, limit=24) ---"
curl -s "https://api.pionex.com/api/v1/market/klines?symbol=$SYMBOL_UPPER&interval=1D&limit=24" | head -c 500
echo ""

echo ""
echo "--- CoinEx (market=$SYMBOL_UPPER, type=1day, limit=24) ---"
curl -s "https://api.coinex.com/v1/market/kline?market=$SYMBOL_UPPER&type=1day&limit=24" | head -c 500
echo ""

echo ""
echo "--- AscendEX barhist (symbol=$SYMBOL, interval=1d, 24 days range) ---"
END_MS=$(($(date +%s) * 1000))
START_MS=$((END_MS - 24 * 24 * 60 * 60 * 1000))
curl -s "https://ascendex.com/api/pro/v1/barhist?symbol=$SYMBOL&interval=1d&from=$START_MS&to=$END_MS" | head -c 500
echo ""

echo ""
echo "--- XT.com (MARKET=$SYMBOL_UPPER, interval=1d, limit=24) ---"
curl -s "https://sapi.xt.com/v4/public/klines?MARKET=$SYMBOL_UPPER&interval=1d&limit=24" | head -c 500
echo ""

echo ""
echo "--- BitMart (symbol=$SYMBOL, step=1440, limit=24) ---"
curl -s "https://api-cloud.bitmart.com/spot/quotation/v3/lite-klines?symbol=$SYMBOL&step=1440&limit=24" | head -c 500
echo ""

echo ""
echo "--- MEXC (symbol=$SYMBOL_UPPER, interval=1d, limit=24) ---"
curl -s "https://api.mexc.com/api/v3/klines?symbol=$SYMBOL_UPPER&interval=1d&limit=24" | head -c 500
echo ""

echo ""
echo "--- FameEX (symbol=$SYMBOL, interval=1day, limit=24) ---"
curl -s "https://api.fameex.com/sapi/v1/klines?symbol=$SYMBOL&interval=1day&limit=24" | head -c 500
echo ""

echo ""
echo "=== Done. If you see JSON with candles arrays, limit=24 is supported. ==="
