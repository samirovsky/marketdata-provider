// REST and GraphQL on one HTTP port (Vercel project marketdata-api), plus the trust policy.
import { serve } from "@hono/node-server";
import { execute } from "./graphql.ts";
import { requireKey, rest } from "./rest.ts";
import { trustConfig, trustRoutes, type TrustConfig } from "./trust.ts";

export function app(trust: TrustConfig = trustConfig()) {
  const a = rest();
  trustRoutes(a, trust);
  a.get("/", (c) => c.json({ service: "market data", rest: ["/v1", "/v2"], graphql: ["/api/v1/graphql", "/api/v2/graphql"] }));
  a.get("/healthz", (c) => c.text("ok"));
  a.post("/api/:version/graphql", async (c) => {
    const version = c.req.param("version");
    if (version !== "v1" && version !== "v2") return c.json({ errors: [{ message: `no GraphQL API ${version}` }] }, 404);
    if (!requireKey(c.req.header("x-marketdata-key"))) return c.json({ errors: [{ message: "missing X-Marketdata-Key" }] }, 401);
    return c.json(await execute(version, await c.req.json()));
  });
  return a;
}

if (process.argv[1]?.endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? 8080);
  serve({ fetch: app().fetch, port });
  console.log(`market data REST + GraphQL on :${port}`);
}
