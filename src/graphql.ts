// GraphQL, versions 1 and 2, at /api/v1/graphql and /api/v2/graphql. The schemas are the
// files biject compiles the GraphQL lock from.
import { readFileSync } from "node:fs";
import { buildSchema, graphql, type GraphQLSchema } from "graphql";
import { candles, instrument, INSTRUMENTS, quote, type Interval } from "./data.ts";

const root = new URL("..", import.meta.url);
const schemaFile = (version: string) => readFileSync(new URL(`graphql/${version}.graphql`, root), "utf8");

const INTERVAL: Record<string, Interval> = { MIN1: "1m", MINUTE1: "1m", HOUR1: "1h", DAY1: "1d", WEEK1: "1w" };

function rootValue(version: "v1" | "v2") {
  return {
    instruments: () => INSTRUMENTS,
    instrument: ({ symbol }: { symbol: string }) => instrument(symbol) ?? null,
    quote: ({ symbol }: { symbol: string }) => {
      const q = quote(symbol);
      if (!q) return null;
      return version === "v1" ? q : { symbol: q.symbol, last: { amount: q.price, currency: q.currency }, volume: q.volume, timestamp: q.timestamp };
    },
    candles: (args: { symbol: string; interval: string; limit?: number; count?: number }) =>
      candles(args.symbol, INTERVAL[args.interval] ?? "1d", (version === "v1" ? args.limit : args.count) ?? 30) ?? [],
  };
}

const schemas = new Map<string, GraphQLSchema>();
function schema(version: "v1" | "v2"): GraphQLSchema {
  let s = schemas.get(version);
  if (!s) {
    s = buildSchema(schemaFile(version));
    schemas.set(version, s);
  }
  return s;
}

export async function execute(version: "v1" | "v2", body: { query?: string; variables?: Record<string, unknown>; operationName?: string }) {
  if (typeof body.query !== "string") return { errors: [{ message: "a query is required" }] };
  return graphql({ schema: schema(version), source: body.query, rootValue: rootValue(version), variableValues: body.variables, operationName: body.operationName });
}
