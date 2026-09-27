import QRCode from "qrcode";
import { SocketClient, connectionToken } from "../socket";
import type { ExperimentType } from "../contracts";

// One pairing surface and handshake for every instrument.
export const phoneConnectionCard = `<section class="card phone-card"><div class="phone-card-heading"><div><h2>Телефон</h2><p id="connection" class="connection-state">Не подключён</p></div><button id="create" class="button-primary">Подключить</button></div><span id="session" class="session-code">—</span><div class="pair" id="pair" hidden><canvas id="qr" aria-label="QR-код для подключения телефона"></canvas><div><p>Отсканируйте QR телефоном</p></div></div><p id="error" role="alert"></p><details class="secondary sensor-summary"><summary>Состояние датчиков</summary><p id="availability">Датчики ожидают подключения</p><p id="rate">Частота: —</p><p id="phone-status" class="muted"></p></details></section>`;

const SESSION_KEY = "pocketlab.phone-session.v1";
export function savedLaptopSession(): { code: string; token: string } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (
      /^[A-HJ-NP-Z2-9]{6}$/.test(saved?.code) &&
      typeof saved?.token === "string" &&
      saved.token.length >= 16 && saved.token.length <= 100
    ) return saved;
  } catch { /* discard malformed persisted sessions */ }
  localStorage.removeItem(SESSION_KEY);
  return null;
}

export class LaptopSession extends SocketClient {
  constructor(experiment: ExperimentType, message: (m: any) => void, status: (connected: boolean) => void) {
    const saved = savedLaptopSession();
    const token = saved?.token || connectionToken();
    let code = saved?.code || "";
    super(() => code ? { type: "resume", code, token, experiment } : { type: "create", token, experiment }, m => {
      if (m.type === "session") {
        code = m.code;
        localStorage.setItem(SESSION_KEY, JSON.stringify({ code, token }));
      }
      if (m.type === "error" && m.message.includes("expired")) {
        code = "";
        localStorage.removeItem(SESSION_KEY);
      }
      // An old or corrupted browser token can make even the initial resume packet invalid.
      // Drop it so the next click creates a fresh session instead of repeating the bad resume.
      if (m.type === "error" && m.message === "Invalid packet") {
        code = "";
        localStorage.removeItem(SESSION_KEY);
      }
      message(m);
    }, status);
  }
}

export function bindPairing(root: HTMLElement, session: () => string) {
  const el = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  function pair() {
    try {
      const url = new URL("/phone", location.origin);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error();
      url.searchParams.set("session", session());
      void QRCode.toCanvas(el("qr") as HTMLCanvasElement, url.href, { width: 150, margin: 1 });
      el("error").textContent = url.protocol !== "https:"
        ? "Phone sensors require trusted HTTPS. See README for HTTPS setup." : "";
    } catch {
      el("error").textContent = "Введите корректный HTTP(S) адрес приложения.";
    }
  }
  return pair;
}

export function renderPhoneConnection(root: HTMLElement, phoneConnected: boolean, connected: boolean, session: string) {
  root.querySelector<HTMLElement>("#connection")!.textContent = phoneConnected
    ? "Телефон подключён" : connected ? "Ожидание подключения телефона"
    : session ? "Нет связи с сервером" : "Сессия ещё не создана";
  root.querySelector<HTMLButtonElement>("#create")!.disabled = !!session && connected;
}
