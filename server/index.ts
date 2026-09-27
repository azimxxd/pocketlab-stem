import express from "express";
import { createServer as http } from "node:http";
import { createServer as https } from "node:https";
import { readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { resolve } from "node:path";
import { attachRelay } from "./relay";
const app = express();
app.get("/health", (_req, res) => res.json({ ok: true }));
const tls = process.env.TLS_CERT && process.env.TLS_KEY;
const server = tls
  ? https(
      {
        cert: readFileSync(process.env.TLS_CERT!),
        key: readFileSync(process.env.TLS_KEY!),
      },
      app,
    )
  : http(app);
attachRelay(server);
if (process.argv.includes("--production")) {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: {
      middlewareMode: true,
      hmr: { server },
      allowedHosts: process.env.PUBLIC_HOST
        ? [process.env.PUBLIC_HOST]
        : undefined,
    },
    appType: "spa",
  });
  app.use(vite.middlewares);
}
const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log(`PocketLab: ${tls ? "https" : "http"}://localhost:${port}`);
  for (const list of Object.values(networkInterfaces()))
    for (const n of list || [])
      if (n.family === "IPv4" && !n.internal)
        console.log(
          `LAN: ${tls ? "https" : "http"}://${n.address}:${port} (phone needs trusted HTTPS)`,
        );
});
