import express from "express";
import { createServer } from "node:http";
import { attachRelay } from "../server/relay.js";

// Vercel routes this Node function at /api/ws. Keep relay state in this
// function instance; no external database or paid service is required.
const app = express();
app.use((_request, response) => {
  response.status(426).type("text/plain").send("WebSocket upgrade required");
});
const server = createServer(app);
// Vercel maps this function to /api/ws and owns the upgrade routing, so leave
// the WebSocketServer path unset here. Local development still binds to /ws.
attachRelay(server);

export default server;
