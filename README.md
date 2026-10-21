# Tickerline market data (sample provider)

A fictional market data provider serving one API over three protocols, set up for
[biject](https://github.com/samirovsky/biject). Prices are synthetic and deterministic.

| Protocol | Released (v1) | Next (v2) | Host |
|----------|---------------|-----------|------|
| REST | `openapi/v1.yaml`, `/v1` | `openapi/v2.yaml`, `/v2` | `https://tickerline-api.fly.dev` |
| GraphQL | `graphql/v1.graphql`, `/api/v1/graphql` | `graphql/v2.graphql`, `/api/v2/graphql` | `https://tickerline-api.fly.dev` |
| gRPC | `tickerline.marketdata.v1` | `tickerline.marketdata.v2` | `tickerline-grpc.fly.dev:443` |

Every call needs an `X-Tickerline-Key` header (gRPC: `x-tickerline-key` metadata); any
non-empty value works on the demo.

The service serves v1 and v2 side by side. `.biject.yml` names the **released** version of
each protocol; `api.lock.<protocol>.yaml` are the compiled locks.

## What v2 breaks

- **REST:** `GET /candles/{symbol}` moves to `GET /instruments/{symbol}/candles`;
  `Quote.price` is `last`, `Quote.timestamp` is `as_of`.
- **GraphQL:** `Quote.price` and `Quote.currency` move into `last: Money`;
  `candles(limit:)` is `candles(count:)`; `Interval.MIN1` is `MINUTE1` (`WEEK1` is new).
- **gRPC:** `GetQuote` is `FetchQuote`; `Quote.price` is `last`; `Quote.volume` widens
  to `int64`; `ListCandlesRequest.limit` is `count`; `INTERVAL_1W` is new.

## Releasing v2 (the biject flow)

1. Install the biject provider GitHub App on this repository.
2. Open a PR that points `.biject.yml` at the v2 files (`openapi/v2.yaml`,
   `graphql/v2.graphql` with `version: v2`, `build/v2.binpb`). biject comments with the
   classified changes and drafts one migration package per protocol.
3. Review the drafts in biject, approve, merge the signing PR; tag `v2.0.0`.
4. Client teams click **Migrate my client** on the published migration guide.

## Run it

```sh
npm ci
npm test
npm start          # REST + GraphQL on :8080
npm run grpc       # gRPC on :50051
npm run descriptors   # rebuild build/v1.binpb and build/v2.binpb (needs buf)
```

Deploy: `fly launch --copy-config` (REST + GraphQL) and
`fly launch --config fly.grpc.toml --copy-config` (gRPC), then `fly deploy` with the same flags.
