// The trust policy this API serves from its own host, where biject and clients look for it:
//   /.well-known/api-migrations-trust.json               the policy, as merged in this repository
//   /.well-known/api-migrations-trust.json.sigstore.json  its signatures, collected by biject
// The policy file is the one biject's "Edit signers" PR adds (trust/.well-known/…); serving it
// straight from the repository's default branch means merging that PR publishes it, with no
// redeploy. Signatures verify only against the signers the policy names, so taking them from
// biject adds no trust.
import type { Hono } from "hono";

export const POLICY_PATH = "/.well-known/api-migrations-trust.json";
export const BUNDLE_PATH = `${POLICY_PATH}.sigstore.json`;

export type TrustConfig = {
  /** owner/name of the repository holding trust/.well-known/api-migrations-trust.json. */
  repo: string;
  branch: string;
  /** The biject server collecting the signatures. */
  bijectUrl: string;
  fetch: typeof fetch;
  /** How long a fetched policy is reused, in milliseconds. */
  cacheMs: number;
};

export function trustConfig(env: NodeJS.ProcessEnv = process.env): TrustConfig {
  return {
    repo: env.PROVIDER_REPO ?? "samirovsky/marketdata-provider",
    branch: env.PROVIDER_BRANCH ?? "main",
    bijectUrl: (env.BIJECT_URL ?? "https://biject-demo.vercel.app").replace(/\/$/, ""),
    fetch: globalThis.fetch,
    cacheMs: 60_000,
  };
}

export function trustRoutes(app: Hono, cfg: TrustConfig) {
  let cached: { at: number; body: string | null } | null = null;
  async function policy(): Promise<string | null> {
    if (cached && Date.now() - cached.at < cfg.cacheMs) return cached.body;
    const url = `https://raw.githubusercontent.com/${cfg.repo}/${cfg.branch}/trust${POLICY_PATH}`;
    const res = await cfg.fetch(url);
    const body = res.ok ? await res.text() : null;
    if (res.ok || res.status === 404) cached = { at: Date.now(), body };
    else throw new Error(`${url}: HTTP ${res.status}`);
    return body;
  }

  app.get(POLICY_PATH, async (c) => {
    const body = await policy();
    return body === null ? c.json({ error: "no trust policy published yet" }, 404) : c.body(body, 200, { "content-type": "application/json" });
  });

  app.get(BUNDLE_PATH, async (c) => {
    const body = await policy();
    if (body === null) return c.json({ error: "no trust policy published yet" }, 404);
    const p = JSON.parse(body) as { version?: number; apis?: string[] };
    const api = p.apis?.[0];
    if (!api || typeof p.version !== "number") return c.json({ error: "the trust policy names no API or version" }, 500);
    const res = await cfg.fetch(`${cfg.bijectUrl}/api/public/policy-bundles?api=${encodeURIComponent(api)}&version=${p.version}`);
    return c.body(await res.text(), res.status === 200 ? 200 : 404, { "content-type": "application/json" });
  });
}
