// REST and GraphQL on one HTTP port (Fly app tickerline-api).
import { serve } from "@hono/node-server";
import { execute } from "./graphql.ts";
import { requireKey, rest } from "./rest.ts";

export function app() {
  const a = rest();
  a.get("/", (c) => c.json({ service: "tickerline market data", rest: ["/v1", "/v2"], graphql: ["/api/v1/graphql", "/api/v2/graphql"] }));
  a.get("/healthz", (c) => c.text("ok"));
  a.post("/api/:version/graphql", async (c) => {
    const version = c.req.param("version");
    if (version !== "v1" && version !== "v2") return c.json({ errors: [{ message: `no GraphQL API ${version}` }] }, 404);
    if (!requireKey(c.req.header("x-tickerline-key"))) return c.json({ errors: [{ message: "missing X-Tickerline-Key" }] }, 401);
    return c.json(await execute(version, await c.req.json()));
  });
  return a;
}

if (process.argv[1]?.endsWith("server.ts")) {
  const port = Number(process.env.PORT ?? 8080);
  serve({ fetch: app().fetch, port });
  console.log(`tickerline REST + GraphQL on :${port}`);
}
