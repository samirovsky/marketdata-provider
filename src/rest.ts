// REST, versions 1 and 2, served side by side during the migration window.
import { Hono } from "hono";
import { candles, INSTRUMENTS, quote, type Interval } from "./data.ts";

const V1_INTERVALS: Interval[] = ["1m", "1h", "1d"];
const V2_INTERVALS: Interval[] = ["1m", "1h", "1d", "1w"];

/** Every endpoint needs an API key; any non-empty key works on this public demo. */
export function requireKey(header: string | undefined): boolean {
  return typeof header === "string" && header.trim().length > 0;
}

export function rest(): Hono {
  const app = new Hono();
  app.use("/v1/*", async (c, next) => (requireKey(c.req.header("x-tickerline-key")) ? next() : c.json({ error: "missing X-Tickerline-Key" }, 401)));
  app.use("/v2/*", async (c, next) => (requireKey(c.req.header("x-tickerline-key")) ? next() : c.json({ error: "missing X-Tickerline-Key" }, 401)));

  for (const v of ["v1", "v2"]) {
    app.get(`/${v}/instruments`, (c) => c.json(INSTRUMENTS));
  }

  app.get("/v1/quotes/:symbol", (c) => {
    const q = quote(c.req.param("symbol"));
    return q ? c.json(q) : c.json({ error: "unknown symbol" }, 404);
  });
  app.get("/v2/quotes/:symbol", (c) => {
    const q = quote(c.req.param("symbol"));
    if (!q) return c.json({ error: "unknown symbol" }, 404);
    return c.json({ symbol: q.symbol, last: q.price, currency: q.currency, volume: q.volume, as_of: q.timestamp });
  });

  app.get("/v1/candles/:symbol", (c) => {
    const interval = c.req.query("interval") as Interval;
    if (!V1_INTERVALS.includes(interval)) return c.json({ error: "interval must be 1m, 1h or 1d" }, 400);
    const out = candles(c.req.param("symbol"), interval, Number(c.req.query("limit") ?? 30));
    return out ? c.json(out) : c.json({ error: "unknown symbol" }, 404);
  });
  app.get("/v2/instruments/:symbol/candles", (c) => {
    const interval = c.req.query("interval") as Interval;
    if (!V2_INTERVALS.includes(interval)) return c.json({ error: "interval must be 1m, 1h, 1d or 1w" }, 400);
    const out = candles(c.req.param("symbol"), interval, Number(c.req.query("limit") ?? 30));
    return out ? c.json(out) : c.json({ error: "unknown symbol" }, 404);
  });
  return app;
}
