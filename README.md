# Market Data (sample provider)

[![ci](https://github.com/samirovsky/marketdata-provider/actions/workflows/ci.yml/badge.svg)](https://github.com/samirovsky/marketdata-provider/actions/workflows/ci.yml)
[![migrate with biject](https://biject-demo.vercel.app/badge/samirovsky/marketdata.svg)](https://biject-demo.vercel.app/migrate/samirovsky/marketdata)

**Calling this API from your code?** Click **migrate with biject** and install biject's GitHub
App on your repositories. That's the whole setup: biject finds the calls and opens a pull
request migrating them to the latest version, verified in your own CI.

A fictional market data provider, set up for [biject](https://github.com/samirovsky/biject).
Prices are synthetic and deterministic.

| API | Released (v1) | Next (v2) | Host |
|-----|---------------|-----------|------|
| REST | `openapi/v1.yaml`, `/v1` | `openapi/v2.yaml`, `/v2` | `https://marketdata-api.vercel.app` |

Every call needs an `X-Marketdata-Key` header; any non-empty value works on the demo. The
service also speaks GraphQL (`graphql/`) and gRPC (`proto/`), which the live demo doesn't
release.

The service serves v1 and v2 side by side. `.biject.yml` names the **released** version;
`api.lock.http.yaml` is its compiled lock. The trust policy this API publishes
(`/.well-known/api-migrations-trust.json`) is `trust/.well-known/api-migrations-trust.json` in
this repository, added by biject's **Edit signers** PR.

## What REST v2 breaks

`GET /candles/{symbol}` moves to `GET /instruments/{symbol}/candles`; `Quote.price` is `last`,
`Quote.timestamp` is `as_of`. `GET /fx/{pair}` needs `?account=` (FX usage is metered per
account).

## Releasing v2 (the biject flow)

1. Install the biject provider GitHub App on this repository.
2. Open a PR that points `.biject.yml` at `openapi/v2.yaml`. biject comments with the
   classified changes and drafts the migration package.
3. Review the draft in biject, approve, merge the signing PR; tag `v2.0.0`.
4. Client repositories with biject installed get their migration PR.

## Run it

```sh
npm ci
npm test
npm start          # REST + GraphQL + trust policy on :8080
```

Deployed as the Vercel container project `marketdata-api` (`scripts/bijectctl deploy provider`
in the biject repository).
