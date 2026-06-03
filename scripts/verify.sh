#!/usr/bin/env bash
# LeoMoney V4 端到端冒烟验证（需服务已启动：npm start）
set -euo pipefail

BASE="${LEOMONEY_URL:-http://localhost:3210}"
FAIL=0

ok() { echo "  ✓ $1"; }
fail() { echo "  ✗ $1"; FAIL=1; }

echo "=== LeoMoney V4 verify @ $BASE ==="

echo "[1] npm run check"
if npm run check >/dev/null 2>&1; then ok "check"; else fail "check"; fi

echo "[2] GET /api/health"
H=$(curl -sf "$BASE/api/health" || true)
if echo "$H" | grep -q '"simulatedTradingOnly":true'; then ok "health + 模拟盘声明"; else fail "health"; fi
if echo "$H" | grep -q '美股'; then ok "health V4 美股定位"; else fail "health V4 定位"; fi
if echo "$H" | grep -qi 'binance'; then fail "health 含 Binance 字样"; else ok "health 无 Binance 品牌"; fi

echo "[3] GET /api/market/overview"
M=$(curl -sf "$BASE/api/market/overview" || true)
if echo "$M" | grep -q '"indices"'; then ok "大盘概览"; else fail "market overview"; fi
if echo "$M" | grep -q 'BTCUSDT'; then ok "大盘条含 BTC"; else fail "overview BTC"; fi

echo "[4] GET /api/quotes"
Q=$(curl -sf "$BASE/api/quotes" || true)
if echo "$Q" | grep -q '"crypto"'; then ok "quotes 含加密"; else fail "quotes"; fi
US=$(echo "$Q" | grep -o '"usstocks":\[' | wc -l | tr -d ' ')
if [ "${US:-0}" -ge 1 ]; then ok "quotes 含美股"; else fail "quotes 美股"; fi

echo "[5] GET /api/quotes/BTCUSDT"
B=$(curl -sf "$BASE/api/quotes/BTCUSDT" || true)
if echo "$B" | grep -q '"price"'; then ok "单标的行情"; else fail "BTCUSDT quote"; fi

echo "[6] GET /api/kline/BTCUSDT"
K=$(curl -sf "$BASE/api/kline/BTCUSDT?scale=5&limit=20" || true)
if echo "$K" | grep -q '"points"'; then ok "K线"; else fail "kline"; fi

echo "[7] POST /api/intel/scan"
I=$(curl -sf -X POST "$BASE/api/intel/scan" \
  -H "Content-Type: application/json" \
  -d '{"query":"宏观 流动性","symbol":"BTCUSDT"}' || true)
NEWS=$(echo "$I" | grep -o '"title"' | wc -l | tr -d ' ')
if [ "${NEWS:-0}" -ge 2 ]; then ok "情报头条 (${NEWS} titles)"; else fail "intel 新闻为空"; fi
if echo "$I" | grep -q '"related"'; then ok "情报标的映射"; else fail "intel related"; fi

echo "[8] GET /api/intel/feed"
F=$(curl -sf "$BASE/api/intel/feed?limit=5" || true)
if echo "$F" | grep -q '"items"'; then ok "情报 feed"; else fail "intel feed"; fi

echo "[9] GET /api/account/summary"
S=$(curl -sf "$BASE/api/account/summary" || true)
if echo "$S" | grep -q 'totalAssets'; then ok "账户汇总"; else fail "account summary"; fi

echo "[10] GET /api/agent/status"
A=$(curl -sf "$BASE/api/agent/status" || true)
if echo "$A" | grep -q '"agent"'; then ok "分析师 Agent"; else fail "agent status"; fi

echo "[11] V4 React 静态资源"
HTML=$(curl -sf "$BASE/" || true)
if echo "$HTML" | grep -q 'id="root"'; then ok "React root"; else fail "React root"; fi
JS=$(echo "$HTML" | grep -o '/assets/[^"]*\.js' | head -1)
CSS=$(echo "$HTML" | grep -o '/assets/[^"]*\.css' | head -1)
for path in "$JS" "$CSS"; do
  code=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE$path" || echo "000")
  if [ "$code" = "200" ]; then ok "static $path"; else fail "static $path ($code)"; fi
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "=== 全部通过 ==="
  exit 0
else
  echo "=== 存在失败项 ==="
  exit 1
fi
