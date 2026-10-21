import { test } from "node:test";
import assert from "node:assert/strict";
import * as grpc from "@grpc/grpc-js";
import * as loader from "@grpc/proto-loader";
import { app } from "./server.ts";
import { server } from "./grpc.ts";

const KEY = { "x-tickerline-key": "demo" };
const get = (path: string, headers: Record<string, string> = KEY) => app().request(path, { headers });
const gql = (version: string, query: string, variables = {}) =>
  app().request(`/api/${version}/graphql`, { method: "POST", headers: { ...KEY, "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });

test("REST needs an API key", async () => {
  assert.equal((await get("/v1/quotes/TLX", {})).status, 401);
});

test("REST v1 and v2 serve the same data in their own shapes", async () => {
  const v1 = await (await get("/v1/quotes/TLX")).json();
  assert.equal(typeof v1.price, "number");
  assert.ok(v1.timestamp);
  const v2 = await (await get("/v2/quotes/tlx")).json();
  assert.equal(v2.last, v1.price);
  assert.equal(v2.as_of, v1.timestamp);
  assert.equal((await get("/v1/quotes/NOPE")).status, 404);
  const c1 = await (await get("/v1/candles/ORBT?interval=1d&limit=5")).json();
  const c2 = await (await get("/v2/instruments/ORBT/candles?interval=1d&limit=5")).json();
  assert.equal(c1.length, 5);
  assert.deepEqual(c1, c2);
  assert.equal((await get("/v1/candles/ORBT?interval=1w")).status, 400, "1w is new in v2");
});

test("GraphQL v1 and v2 follow their schemas", async () => {
  const v1 = await (await gql("v1", "query($s: String!) { quote(symbol: $s) { price currency } candles(symbol: $s, interval: MIN1, limit: 2) { c } }", { s: "KELP" })).json();
  assert.equal(v1.errors, undefined, JSON.stringify(v1.errors));
  assert.equal(v1.data.quote.currency, "EUR");
  assert.equal(v1.data.candles.length, 2);
  const v2 = await (await gql("v2", "{ quote(symbol: \"KELP\") { last { amount currency } } candles(symbol: \"KELP\", interval: WEEK1, count: 3) { c } }")).json();
  assert.equal(v2.errors, undefined, JSON.stringify(v2.errors));
  assert.equal(v2.data.quote.last.amount, v1.data.quote.price);
  assert.equal(v2.data.candles.length, 3);
  // v1 documents don't validate against v2.
  const old = await (await gql("v2", "{ quote(symbol: \"KELP\") { price } }")).json();
  assert.ok(old.errors?.length);
});

function client(version: "v1" | "v2", port: number) {
  const root = new URL("../proto/", import.meta.url).pathname;
  const def = loader.loadSync(`tickerline/marketdata/${version}/marketdata.proto`, { includeDirs: [root, `${root}third_party`], keepCase: true, enums: String, longs: String });
  const Ctor = (grpc.loadPackageDefinition(def) as any).tickerline.marketdata[version].MarketData;
  return new Ctor(`127.0.0.1:${port}`, grpc.credentials.createInsecure());
}

test("gRPC v1 and v2 answer on one server", async () => {
  const s = server();
  const port = await new Promise<number>((ok, ko) => s.bindAsync("127.0.0.1:0", grpc.ServerCredentials.createInsecure(), (e, p) => (e ? ko(e) : ok(p))));
  try {
    const md = new grpc.Metadata();
    md.set("x-tickerline-key", "demo");
    const call = (c: any, m: string, req: object, meta = md) => new Promise<any>((ok, ko) => c[m](req, meta, (e: any, r: any) => (e ? ko(e) : ok(r))));
    const v1 = await call(client("v1", port), "GetQuote", { symbol: "NOVA" });
    const v2 = await call(client("v2", port), "FetchQuote", { symbol: "NOVA" });
    assert.equal(v2.last, v1.price);
    assert.equal(typeof v2.volume, "string", "int64 travels as a string in proto3 JSON");
    const candles = await call(client("v2", port), "ListCandles", { symbol: "NOVA", interval: "INTERVAL_1W", count: 4 });
    assert.equal(candles.candles.length, 4);
    await assert.rejects(call(client("v1", port), "GetQuote", { symbol: "NOVA" }, new grpc.Metadata()), (e: any) => e.code === grpc.status.UNAUTHENTICATED);
  } finally {
    s.forceShutdown();
  }
});
