import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";

type Handler = (request: Request) => Promise<Response>;

async function readBody(req: IncomingMessage): Promise<Buffer | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

async function serveApi(server: ViteDevServer, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://localhost");
  const name = url.pathname.replace(/^\/api\//, "");
  const mod = (await server.ssrLoadModule(`/api/${name}.ts`)) as Record<string, Handler | undefined>;
  const handler = mod[req.method ?? "GET"];
  if (!handler) {
    res.statusCode = 405;
    res.end();
    return;
  }
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers.set(key, value);
  }
  headers.set("x-real-ip", req.socket.remoteAddress ?? "local");
  const response = await handler(
    new Request(url, { method: req.method, headers, body: await readBody(req) }),
  );
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

// Serves api/*.ts with the same Web Request/Response signature Vercel uses, so `npm run dev`
// works without `vercel dev`.
function localApi(): Plugin {
  return {
    name: "local-api",
    configureServer(server) {
      server.middlewares.use("/api/", (req, res, next) => {
        req.url = `/api${req.url}`;
        serveApi(server, req, res).catch(next);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // Server-only secrets for the local API; never exposed to the client bundle (no VITE_ prefix).
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
  return { plugins: [react(), localApi()] };
});
