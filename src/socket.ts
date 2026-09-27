export function connectionToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export class SocketClient {
  private ws?: WebSocket;
  private retry = 0;
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  latency: number | null = null;
  constructor(
    private hello: () => unknown,
    private message: (m: any) => void,
    private status: (connected: boolean) => void,
  ) {
    this.connect();
  }
  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  send(data: unknown): boolean {
    if (!this.connected || this.ws!.bufferedAmount > 512000) return false;
    this.ws!.send(JSON.stringify(data));
    return true;
  }
  private connect() {
    const path = import.meta.env.PROD ? "/api/ws" : "/ws";
    const ws = (this.ws = new WebSocket(
      `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${path}`,
    ));
    ws.onopen = () => {
      this.retry = 0;
      this.send(this.hello());
      this.status(true);
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.type === "pong") this.latency = performance.now() - m.sent;
        else this.message(m);
      } catch {
        this.message({ type: "error", message: "Invalid server message" });
      }
    };
    const ping = setInterval(
      () => this.send({ type: "ping", sent: performance.now() }),
      3000,
    );
    ws.onclose = () => {
      clearInterval(ping);
      this.status(false);
      if (!this.stopped)
        this.timer = setTimeout(
          () => this.connect(),
          Math.min(8000, 500 * 2 ** this.retry++),
        );
    };
    ws.onerror = () => ws.close();
  }
  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.ws?.close();
  }
}
