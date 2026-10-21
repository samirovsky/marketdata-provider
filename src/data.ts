// Deterministic market data for a handful of fictional instruments. Prices move with the
// clock, so every call returns a plausible, repeatable value for a given minute.

export interface Instrument {
  symbol: string;
  name: string;
  exchange: "XTLN" | "XORB";
  currency: "USD" | "EUR";
}

export const INSTRUMENTS: Instrument[] = [
  { symbol: "TLX", name: "Tickerline Holdings", exchange: "XTLN", currency: "USD" },
  { symbol: "ORBT", name: "Orbital Freight", exchange: "XORB", currency: "USD" },
  { symbol: "KELP", name: "Kelp Energy", exchange: "XTLN", currency: "EUR" },
  { symbol: "NOVA", name: "Nova Biologics", exchange: "XORB", currency: "USD" },
];

const BASE: Record<string, number> = { TLX: 182.4, ORBT: 41.15, KELP: 12.88, NOVA: 96.02 };

export function instrument(symbol: string): Instrument | undefined {
  return INSTRUMENTS.find((i) => i.symbol === symbol.toUpperCase());
}

/** A small, repeatable wobble: sine of the minute index, scaled per instrument. */
function priceAt(symbol: string, minute: number): number {
  const base = BASE[symbol] ?? 100;
  const wobble = Math.sin(minute / 17 + symbol.length) * 0.012 + Math.sin(minute / 3.1) * 0.003;
  return Math.round(base * (1 + wobble) * 100) / 100;
}

export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  volume: number;
  timestamp: string;
}

export function quote(symbol: string, now = Date.now()): Quote | undefined {
  const i = instrument(symbol);
  if (!i) return undefined;
  const minute = Math.floor(now / 60_000);
  return {
    symbol: i.symbol,
    price: priceAt(i.symbol, minute),
    currency: i.currency,
    volume: 10_000 + ((minute * 7919) % 50_000),
    timestamp: new Date(minute * 60_000).toISOString(),
  };
}

export type Interval = "1m" | "1h" | "1d" | "1w";
const STEP: Record<Interval, number> = { "1m": 1, "1h": 60, "1d": 1440, "1w": 10080 };

export interface Candle {
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/** The last `limit` candles, oldest first. */
export function candles(symbol: string, interval: Interval, limit: number, now = Date.now()): Candle[] | undefined {
  const i = instrument(symbol);
  if (!i) return undefined;
  const step = STEP[interval];
  const end = Math.floor(now / 60_000 / step) * step;
  const out: Candle[] = [];
  for (let k = Math.min(Math.max(limit, 1), 500) - 1; k >= 0; k--) {
    const start = end - k * step;
    const prices = [0, step / 3, (2 * step) / 3, step - 1].map((m) => priceAt(i.symbol, Math.floor(start + m)));
    out.push({
      t: new Date(start * 60_000).toISOString(),
      o: prices[0]!,
      h: Math.max(...prices),
      l: Math.min(...prices),
      c: prices[3]!,
      v: 1_000 * step + ((start * 31) % 9_000),
    });
  }
  return out;
}
