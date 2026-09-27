import { randomInt } from "node:crypto";
import type { Server } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { clientMessage } from "../src/contracts";
type Session = {
  experiment: "pendulum" | "sound" | "bottle";
  code: string;
  token: string;
  laptop?: WebSocket;
  phone?: WebSocket;
  phoneToken?: string;
  userAgent?: string;
  capabilities?: { motion: boolean; microphone: boolean };
  touched: number;
};
export function attachRelay(server: Server) {
  const sessions = new Map<string, Session>();
  const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 16384 });
  const send = (ws: WebSocket | undefined, data: unknown) => {
    if (ws?.readyState === WebSocket.OPEN) {
      if (ws.bufferedAmount > 2_000_000) {
        ws.close(1013, "Network too slow");
        return;
      }
      ws.send(JSON.stringify(data));
    }
  };
  wss.on("connection", (ws) => {
    let session: Session | undefined, role: "laptop" | "phone" | undefined;
    let alive = true;
    ws.on("pong", () => (alive = true));
    const heartbeat = setInterval(() => {
      if (!alive) ws.terminate();
      else {
        alive = false;
        ws.ping();
      }
    }, 10000);
    const error = (message: string) => send(ws, { type: "error", message });
    ws.on("message", (raw) => {
      let parsed;
      try {
        parsed = clientMessage.safeParse(JSON.parse(raw.toString()));
      } catch {
        error("Invalid JSON");
        return;
      }
      if (!parsed.success) {
        // Keep payload values private while exposing the schema field that caused a rejection.
        const issue = parsed.error.issues[0];
        const path = issue?.path.join(".") || "root";
        error(`Invalid packet at ${path} (${issue?.code || "unknown"})`);
        return;
      }
      const m = parsed.data;
      if (m.type === "ping") {
        send(ws, { type: "pong", sent: m.sent });
        return;
      }
      if (["create", "resume", "join"].includes(m.type) && session) {
        error("Already joined");
        return;
      }
      if (m.type === "create") {
        if (sessions.size >= 1000) {
          error("Server session limit");
          return;
        }
        let code: string;
        const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        do {
          code = Array.from(
            { length: 6 },
            () => alphabet[randomInt(alphabet.length)],
          ).join("");
        } while (sessions.has(code));
        session = { experiment: m.experiment, code, token: m.token, laptop: ws, touched: Date.now() };
        sessions.set(code, session);
        role = "laptop";
        send(ws, { type: "session", code, experiment: session.experiment, phoneConnected: false });
        return;
      }
      if (m.type === "resume") {
        const found = sessions.get(m.code);
        if (!found || found.token !== m.token) {
          error("Session expired. Create a new session.");
          return;
        }
        if (found.laptop && found.laptop !== ws)
          found.laptop.close(4001, "Replaced");
        session = found;
        role = "laptop";
        found.laptop = ws;
        found.experiment = m.experiment ?? found.experiment;
        found.touched = Date.now();
        send(ws, {
          type: "session",
          code: found.code,
          experiment: found.experiment,
          phoneConnected: !!found.phone,
          capabilities: found.capabilities,
          userAgent: found.userAgent,
        });
        send(found.phone, { type: "peer", connected: true });
        send(found.phone, { type: "mode", experiment: found.experiment });
        return;
      }
      if (m.type === "join") {
        const found = sessions.get(m.code);
        if (!found?.laptop) {
          error("Session not found or laptop disconnected");
          return;
        }
        if (found.phone && found.phoneToken !== m.token) {
          error("Session already has a phone");
          return;
        }
        if (found.phone && found.phone !== ws)
          found.phone.close(4001, "Replaced");
        session = found;
        role = "phone";
        found.phone = ws;
        found.phoneToken = m.token;
        found.userAgent = m.userAgent;
        found.touched = Date.now();
        send(ws, { type: "joined", code: found.code, experiment: found.experiment,
          capabilities: found.capabilities });
        send(found.laptop, {
          type: "peer",
          connected: true,
          userAgent: m.userAgent,
        });
        return;
      }
      if (!session || !role) {
        error("Join first");
        return;
      }
      session.touched = Date.now();
      if (m.type === "capabilities" && role === "phone") {
        session.capabilities = { motion: m.motion, microphone: m.microphone };
        send(session.laptop, m);
        return;
      }
      if (
        role === "phone" &&
        ["sample", "sound-frame", "sound-ready", "status", "interruption", "stop"].includes(m.type)
      ) {
        if (m.type === "sound-frame" && session.experiment === "pendulum") {
          error("Microphone data is not active for this experiment");
          return;
        }
        send(session.laptop, m);
      } else if (role === "laptop" && m.type === "state") send(session.phone, m);
      else error("Message not allowed for role");
    });
    ws.on("error", () => {});
    ws.on("close", () => {
      clearInterval(heartbeat);
      if (!session) return;
      session.touched = Date.now();
      if (role === "phone" && session.phone === ws) {
        session.phone = undefined;
        send(session.laptop, { type: "peer", connected: false });
      }
      if (role === "laptop" && session.laptop === ws) {
        session.laptop = undefined;
        send(session.phone, { type: "peer", connected: false });
      }
    });
  });
  const cleanup = setInterval(() => {
    for (const [code, s] of sessions)
      if (!s.laptop && !s.phone && Date.now() - s.touched > 30 * 60_000)
        sessions.delete(code);
  }, 60000);
  wss.on("close", () => clearInterval(cleanup));
  return { wss, sessions };
}
