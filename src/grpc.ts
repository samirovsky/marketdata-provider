// gRPC, packages tickerline.marketdata.v1 and v2 (Fly app tickerline-grpc). Loaded at
// runtime from the same .proto files the gRPC lock is compiled from.
import * as grpc from "@grpc/grpc-js";
import * as loader from "@grpc/proto-loader";
import { candles, quote, type Interval } from "./data.ts";

const root = new URL("../proto/", import.meta.url).pathname;
const INTERVALS: Record<string, Interval> = { INTERVAL_1M: "1m", INTERVAL_1H: "1h", INTERVAL_1D: "1d", INTERVAL_1W: "1w" };

function load(version: "v1" | "v2") {
  const def = loader.loadSync(`tickerline/marketdata/${version}/marketdata.proto`, {
    includeDirs: [root, `${root}third_party`],
    keepCase: true,
    enums: String,
    longs: String,
    defaults: true,
  });
  const pkg = grpc.loadPackageDefinition(def) as any;
  return pkg.tickerline.marketdata[version].MarketData.service as grpc.ServiceDefinition;
}

const ts = (iso: string) => {
  const ms = Date.parse(iso);
  return { seconds: String(Math.floor(ms / 1000)), nanos: 0 };
};

function authorized(call: { metadata: grpc.Metadata }): boolean {
  const key = call.metadata.get("x-tickerline-key")[0];
  return typeof key === "string" && key.trim().length > 0;
}

const unauthenticated = { code: grpc.status.UNAUTHENTICATED, details: "missing x-tickerline-key metadata" };
const notFound = (symbol: string) => ({ code: grpc.status.NOT_FOUND, details: `unknown symbol ${symbol}` });

function handlers(version: "v1" | "v2"): grpc.UntypedServiceImplementation {
  const toQuote = (symbol: string) => {
    const q = quote(symbol);
    if (!q) return undefined;
    const price = version === "v1" ? { price: q.price } : { last: q.price };
    return { symbol: q.symbol, ...price, currency: q.currency, volume: String(q.volume), timestamp: ts(q.timestamp) };
  };
  const getQuote: grpc.handleUnaryCall<any, any> = (call, cb) => {
    if (!authorized(call)) return cb(unauthenticated);
    const q = toQuote(call.request.symbol);
    return q ? cb(null, q) : cb(notFound(call.request.symbol));
  };
  return {
    [version === "v1" ? "GetQuote" : "FetchQuote"]: getQuote,
    ListCandles: ((call, cb) => {
      if (!authorized(call)) return cb(unauthenticated);
      const limit = (version === "v1" ? call.request.limit : call.request.count) || 30;
      const out = candles(call.request.symbol, INTERVALS[call.request.interval] ?? "1d", limit);
      if (!out) return cb(notFound(call.request.symbol));
      return cb(null, { candles: out.map((c) => ({ t: ts(c.t), o: c.o, h: c.h, l: c.l, c: c.c, v: String(c.v) })) });
    }) as grpc.handleUnaryCall<any, any>,
    StreamQuotes: ((call) => {
      if (!authorized(call)) return call.destroy(Object.assign(new Error(unauthenticated.details), unauthenticated));
      const send = () => {
        for (const s of call.request.symbols as string[]) {
          const q = toQuote(s);
          if (q) call.write(q);
        }
      };
      send();
      const timer = setInterval(send, 2_000);
      call.on("cancelled", () => clearInterval(timer));
      call.on("close", () => clearInterval(timer));
    }) as grpc.handleServerStreamingCall<any, any>,
  };
}

export function server(): grpc.Server {
  const s = new grpc.Server();
  for (const v of ["v1", "v2"] as const) s.addService(load(v), handlers(v));
  return s;
}

if (process.argv[1]?.endsWith("grpc.ts")) {
  const port = Number(process.env.PORT ?? 50051);
  server().bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err) => {
    if (err) throw err;
    console.log(`tickerline gRPC on :${port}`);
  });
}
