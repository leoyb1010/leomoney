# Market Data Providers

Last checked: 2026-06-03.

LeoMoney now routes K-line requests through a provider chain:

```text
fresh memory cache -> free public provider -> configured broker/paid provider -> secondary free provider -> local preview fallback
```

The current production chain keeps free sources first. Paid providers are listed with env keys and pricing notes so they can be enabled deliberately instead of being mixed into route code.

## Free Sources In Use

| Provider | Coverage | Used for | Notes |
| --- | --- | --- | --- |
| Binance public API | Crypto spot/perp | Crypto quotes and K-line | Free public API, can be throttled or blocked by network/proxy conditions. |
| Nasdaq public historical | US stocks | Daily/weekly/monthly US K-line | Free web endpoint, unofficial for app use. |
| Yahoo Finance Chart | US/index/A/HK fallback | Intraday and fallback historical K-line | Free web endpoint, unofficial for app use. |
| Tencent public K-line | A/HK/index | Daily/weekly/monthly K-line | Free web endpoint, useful for HK and A shares. |
| Sina public minute | A/index | Minute K-line fallback | Free web endpoint, limited coverage. |

## Paid Candidates

| Provider | Env keys | Best fit | Pricing note |
| --- | --- | --- | --- |
| Alpaca Market Data | `ALPACA_API_KEY`, `ALPACA_API_SECRET` | US equities realtime SIP if broker-style API is acceptable | Basic is free IEX; Algo Trader Plus is $99/mo for all US stock exchanges. |
| Massive/Polygon | `POLYGON_API_KEY` | US realtime equities, historical aggregates, websocket scale | Stocks Starter $29/mo, Developer $79/mo, Advanced $199/mo. |
| Twelve Data | `TWELVE_DATA_API_KEY` | Broad global stocks/forex/crypto/commodities | Free/basic tier exists; individual paid plans shown from $79/mo on the pricing page, with other billing/package views. |
| Alpha Vantage | `ALPHA_VANTAGE_API_KEY` | Low-cost historical bars and technical indicators | Free 25 requests/day; premium $49.99-$249.99/mo by request rate. |
| EODHD | `EODHD_API_KEY` | Global EOD, fundamentals, news | Free plan available; paid access from about GBP 19.99/mo. |
| Databento | `DATABENTO_API_KEY` | Futures/equities/options tick and market microstructure data | Usage-based $/GB; new users get $125 historical-data credits. |
| Intrinio | `INTRINIO_API_KEY` | Business licensed fundamentals/options/equities | Dataset pricing; examples include US Fundamentals at $9,600/yr. |
| Tushare Pro | `TUSHARE_TOKEN` | A-share history and fundamentals | Points/subscription model; common add-ons range from hundreds to thousands RMB/year. |
| Futu OpenAPI | `FUTU_OPEND_HOST`, `FUTU_OPEND_PORT` | HK/A quote permissions and broker account integration | Some mainland-IP personal HK LV2/A LV1 permissions are free; other quote cards are bought in app. |

## Runtime API

`GET /api/market/providers` returns:

- free and paid provider catalog
- which paid provider env keys are configured
- current K-line provider chain
- K-line memory cache size
- active runtime providers

`GET /api/kline/:symbol` returns provider evidence:

- `source`: source label shown in the UI
- `provider`: provider id
- `providerTier`: `free`, `paid`, or `fallback`
- `cached`: whether memory cache answered the request
- `fallback`: whether the app used local preview bars
- `diagnostics`: per-provider ok/skip/failure and latency

## References

- Alpaca Market Data pricing: https://docs.alpaca.markets/docs/about-market-data-api
- Massive/Polygon pricing: https://massive.com/pricing
- Twelve Data pricing: https://twelvedata.com/pricing
- Alpha Vantage premium: https://www.alphavantage.co/premium/
- EODHD pricing entry: https://eodhd.com/
- Databento pricing: https://databento.com/pricing
- Intrinio pricing: https://intrinio.com/pricing
- Tushare Pro data/pricing notes: https://tushare.pro/document/1?doc_id=290
- Futu OpenAPI fees: https://openapi.futunn.com/futu-api-doc/intro/fee.html
