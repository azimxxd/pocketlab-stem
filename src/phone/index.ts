import { MicrophoneSource } from "./microphone";
import jsQR from "jsqr";
import { SensorManager } from "./sensors";
import { SocketClient, connectionToken } from "../socket";
import { SENSOR_STALL_TIMEOUT_MS, type State } from "../contracts";

const validCode = /^[A-HJ-NP-Z2-9]{6}$/;

export function extractSessionCode(value: string) {
  const raw = value.trim();
  try {
    const url = new URL(raw);
    const fromQuery = url.searchParams.get("session") ?? url.searchParams.get("code");
    if (fromQuery && validCode.test(fromQuery.toUpperCase())) return fromQuery.toUpperCase();
    const fromPath = url.pathname.match(/\/phone\/([A-HJ-NP-Z2-9]{6})\/?$/i)?.[1];
    if (fromPath) return fromPath.toUpperCase();
  } catch {
    // A user may scan a QR that contains only the short pairing code.
  }
  const code = raw.toUpperCase();
  return validCode.test(code) ? code : null;
}

export function phone(root: HTMLElement) {
  root.innerHTML = `<div class="phone-app">
    <header class="phone-header"><img src="/pocketlab-logo.png" alt=""><div><strong>PocketLab</strong><span>STEM</span></div></header>
    <main class="phone-main">
      <section id="pairing-panel" class="phone-panel pairing-panel">
        <div class="phone-eyebrow">КАРМАННАЯ ЛАБОРАТОРИЯ</div>
        <h1>Подключить телефон</h1>
        <p id="connection" class="phone-subtitle">Отсканируйте QR-код с ноутбука</p>
        <button id="scan-start" class="phone-scan-button" type="button"><span aria-hidden="true">▦</span> Сканировать QR-код</button>
        <div id="scanner" class="qr-scanner" hidden>
          <video id="qr-video" muted playsinline></video>
          <div class="scan-frame" aria-hidden="true"></div>
          <p id="scanner-status">Наведите камеру на QR-код</p>
          <button id="scan-close" class="phone-text-button" type="button">Закрыть сканер</button>
        </div>
        <div class="phone-divider"><span>или введите код</span></div>
        <label class="phone-code-label" for="code">Код с ноутбука</label>
        <div class="phone-code-row"><input id="code" maxlength="6" autocapitalize="characters" autocomplete="one-time-code" placeholder="ABC123" aria-label="Код подключения"><button id="join" class="phone-primary" type="button">Подключить</button></div>
        <p id="pairing-error" class="phone-error" role="alert"></p>
      </section>
      <section id="sensor-panel" class="phone-panel sensor-panel" hidden>
        <div class="sensor-emblem" aria-hidden="true"><span></span><span></span><span></span></div>
        <h1>Карманная лаборатория</h1>
        <p id="instrument-mode" class="phone-eyebrow">Маятник</p>
        <p id="connection-status" class="phone-subtitle">Телефон подключён</p>
        <button id="permissions" class="phone-primary permission-button" type="button">Разрешить датчики</button>
        <p id="permissions-status" class="sensor-status" role="status" aria-live="polite">Ожидает разрешения</p>
        <p id="instructions" class="visually-hidden">Оставьте эту страницу открытой во время измерения.</p>
      </section>
      <span id="state" class="visually-hidden">DISCONNECTED</span>
    </main>
  </div>`;

  const el = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const code = el("code") as HTMLInputElement;
  const pairingPanel = el("pairing-panel");
  const sensorPanel = el("sensor-panel");
  const video = el("qr-video") as HTMLVideoElement;
  code.value = new URLSearchParams(location.search).get("session") || "";

  let socket: SocketClient | undefined,
    joined = false,
    state: State = "DISCONNECTED",
    lastEvent = 0,
    enabledAt = 0,
    sent = 0,
    permissionMessage = "",
    motionReady = false,
    modeTimer: ReturnType<typeof setTimeout> | undefined,
    stream: MediaStream | undefined,
    scanning = false,
    scanFrameId = 0,
    lastScanAt = 0;
  let experiment: "pendulum" | "sound" | "bottle" = "pendulum";
  let wake: WakeLockSentinel | null = null;
  function phoneToken(session: string) {
    const key = `pocketlab.phone-token.v1:${session}`;
    let saved = localStorage.getItem(key);
    if (!saved) { saved = connectionToken(); localStorage.setItem(key, saved); }
    return saved;
  }
  const active = () => ["CALIBRATING", "READY", "WAITING_FOR_MOTION", "MEASURING"].includes(state);
  const microphoneRequired = () => experiment === "sound" || experiment === "bottle";

  async function updateWake() {
    if (active() && document.visibilityState === "visible" && !wake && "wakeLock" in navigator) {
      try {
        wake = await navigator.wakeLock.request("screen");
        wake.addEventListener("release", () => (wake = null));
      } catch {
        // Sensor streaming remains active if Wake Lock is unavailable.
      }
    } else if (!active() && wake) {
      await wake.release();
      wake = null;
    }
  }

  function interrupt(reason: string) {
    microphone.measure(false);
    socket?.send({ type: "interruption", reason });
    state = "STOPPED";
    el("state").textContent = state;
    if (joined) el("instructions").textContent = "Откройте страницу снова, чтобы продолжить.";
    void updateWake();
  }

  const sensors = new SensorManager((sample) => {
    lastEvent = performance.now();
    if (joined && experiment === "pendulum" && document.visibilityState === "visible") {
      if (socket?.send({ type: "sample", sample })) sent++;
      else if (active()) interrupt("Передача данных прервана: сеть слишком медленная.");
      if (sent > 0 && el("permissions-status").textContent !== "Датчики активны")
        el("permissions-status").textContent = "Датчики активны";
    }
  });

  const microphone = new MicrophoneSource(frame => {
    if (joined && (experiment === "sound" || experiment === "bottle") && ["CALIBRATING", "MEASURING"].includes(state)) {
      if (!socket?.send({ type: "sound-frame", frame })) interrupt("Передача данных прервана: сеть слишком медленная.");
    }
  }, reason => { interrupt(reason); el("permissions-status").textContent = reason; });

  function showMode(next: "pendulum" | "sound" | "bottle") {
    experiment = next;
    const needsMicrophone = microphoneRequired();
    const permissionsReady = motionReady && (!needsMicrophone || microphone.ready);
    el("sensor-panel").querySelector("h1")!.textContent = "Карманная лаборатория";
    el("instrument-mode").textContent = next === "sound" ? "Увидь свой голос" : next === "bottle" ? "Собери музыкальный инструмент" : "Маятник";
    el("permissions").textContent = permissionsReady
      ? "Датчики разрешены"
      : needsMicrophone ? "Разрешить датчики и микрофон" : "Разрешить датчики движения";
    (el("permissions") as HTMLButtonElement).disabled = permissionsReady;
    if (permissionsReady) el("permissions-status").textContent = needsMicrophone
      ? "Датчики движения и микрофон готовы"
      : "Датчики движения разрешены. Ожидаем показаний…";
    microphone.measure((next === "sound" || next === "bottle") && ["CALIBRATING", "MEASURING"].includes(state));
    if(joined)publishCapabilities();
  }

  function publishCapabilities(details?: string) {
    const microphoneReady = microphone.ready;
    socket?.send({ type: "capabilities", motion: motionReady, microphone: microphoneReady });
    if (experiment === "sound" || experiment === "bottle")
      socket?.send({ type: "sound-ready", ready: microphoneReady });
    socket?.send({ type: "status", message: details || [
      motionReady ? "Датчики движения готовы" : "Датчики движения не разрешены",
      microphoneReady ? "микрофон готов" : "микрофон не разрешён",
    ].join("; ") });
  }

  function stopScanner() {
    scanning = false;
    cancelAnimationFrame(scanFrameId);
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    video.srcObject = null;
    el("scanner").hidden = true;
    el("scan-start").hidden = false;
  }

  function foundQr(rawValue: string) {
    const session = extractSessionCode(rawValue);
    if (!session) {
      el("scanner-status").textContent = "В этом QR-коде нет кода подключения PocketLab";
      scanFrameId = requestAnimationFrame(scanLoop);
      return;
    }
    code.value = session;
    stopScanner();
    join();
  }

  const scanCanvas = document.createElement("canvas");
  const scanContext = scanCanvas.getContext("2d", { willReadFrequently: true });
  function scanLoop() {
    if (!scanning || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      if (scanning) scanFrameId = requestAnimationFrame(scanLoop);
      return;
    }
    const now = performance.now();
    if (now - lastScanAt > 140) {
      lastScanAt = now;
      const ratio = Math.min(1, 600 / video.videoWidth);
      scanCanvas.width = Math.max(1, Math.round(video.videoWidth * ratio));
      scanCanvas.height = Math.max(1, Math.round(video.videoHeight * ratio));
      scanContext?.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);
      const pixels = scanContext?.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
      if (pixels) {
        const result = jsQR(pixels.data, pixels.width, pixels.height, { inversionAttempts: "dontInvert" });
        if (result?.data) {
          foundQr(result.data);
          return;
        }
      }
    }
    scanFrameId = requestAnimationFrame(scanLoop);
  }

  async function startScanner() {
    if (!navigator.mediaDevices?.getUserMedia) {
      el("pairing-error").textContent = "Сканер камеры недоступен. Введите код вручную.";
      return;
    }
    el("scan-start").hidden = true;
    el("scanner").hidden = false;
    el("scanner-status").textContent = "Запрашиваем камеру…";
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      video.srcObject = stream;
      await video.play();
      el("scanner-status").textContent = "Наведите камеру на QR-код";
      scanning = true;
      lastScanAt = 0;
      scanFrameId = requestAnimationFrame(scanLoop);
    } catch {
      stopScanner();
      el("pairing-error").textContent = "Не удалось открыть камеру. Введите код вручную.";
    }
  }

  function join() {
    const session = code.value.trim().toUpperCase();
    if (!validCode.test(session)) {
      el("pairing-error").textContent = "Проверьте код подключения.";
      return;
    }
    el("pairing-error").textContent = "";
    el("connection").textContent = "Подключаемся…";
    const token = phoneToken(session);
    socket?.close();
    joined = false;
    socket = new SocketClient(
      () => ({ type: "join", code: session, token, userAgent: navigator.userAgent }),
      (message) => {
        if (message.type === "joined") {
          showMode(message.experiment === "sound" ? "sound" : message.experiment === "bottle" ? "bottle" : "pendulum");
          joined = true;
          state = "CONNECTED";
          el("state").textContent = state;
          pairingPanel.hidden = true;
          sensorPanel.hidden = false;
          el("connection-status").textContent = "Телефон подключён";
          publishCapabilities();
        }
        if (message.type === "mode") showMode(message.experiment === "sound" ? "sound" : message.experiment === "bottle" ? "bottle" : "pendulum");
        if (message.type === "state") {
          state = message.state;
          el("state").textContent = state;
          if (state === "MEASURING" || state === "WAITING_FOR_MOTION")
            el("instructions").textContent = "Идёт измерение — держите страницу открытой.";
          else if (state === "CALIBRATING")
            el("instructions").textContent = "Идёт настройка датчика…";
          else if (state === "CONNECTED" || state === "READY")
            el("instructions").textContent = "Оставьте страницу открытой во время измерения.";
          if (experiment === "sound" || experiment === "bottle") {
            microphone.measure(state === "CALIBRATING" || state === "MEASURING");
            el("instructions").textContent = state === "MEASURING" ? "Идёт измерение..."
              : state === "CALIBRATING" ? "Настройка микрофона. Сохраняйте тишину..."
              : "Управляйте измерением с ноутбука.";
          }
          void updateWake();
        }
        if (message.type === "peer" && !message.connected) {
          joined = false;
          el("connection-status").textContent = "Переключение вкладки…";
          clearTimeout(modeTimer);
          modeTimer = setTimeout(() => {
            if (!joined) interrupt("Ноутбук отключён.");
          }, 2500);
        }
        if (message.type === "peer" && message.connected) {
          clearTimeout(modeTimer);
          joined = true;
          el("connection-status").textContent = "Телефон подключён";
        }
        if (message.type === "error") {
          joined = false;
          const lostSession = /Session not found|Session expired/i.test(message.message || "");
          el("pairing-error").textContent = lostSession
            ? "Сессия устарела. Отсканируйте новый QR-код с ноутбука."
            : "Не удалось подключиться. Проверьте код и повторите.";
          el("connection").textContent = lostSession ? "Нужен новый QR-код" : "Не подключён";
          el("connection-status").textContent = lostSession ? "Сессия завершена — отсканируйте новый QR-код" : "Не удалось подключиться";
          socket?.close();
        }
      },
      (connected) => {
        if (!connected && joined) {
          joined = false;
          interrupt("Связь потеряна.");
          el("connection-status").textContent = "Связь потеряна";
        }
      },
    );
  }

  code.addEventListener("input", () => {
    code.value = code.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6);
    el("pairing-error").textContent = "";
  });
  el("scan-start").onclick = () => void startScanner();
  el("scan-close").onclick = stopScanner;
  el("join").onclick = join;
  el("permissions").onclick = async () => {
    const button = el("permissions") as HTMLButtonElement;
    const needsMicrophone = microphoneRequired();
    button.disabled = true;
    enabledAt = 0;
    lastEvent = 0;
    // Request only the hardware needed by the selected experiment. Keep each
    // browser permission request inside the user's direct button gesture.
    const motionRequest = motionReady ? Promise.resolve(permissionMessage) : sensors.enable();
    const microphoneRequest = !needsMicrophone || microphone.ready
      ? Promise.resolve()
      : microphone.enable();
    const [motionResult, microphoneResult] = await Promise.allSettled([motionRequest, microphoneRequest]);
    motionReady = motionResult.status === "fulfilled";
    if (motionResult.status === "fulfilled") permissionMessage = motionResult.value;
    if (motionReady) { enabledAt = performance.now(); lastEvent = 0; }
    const microphoneReady = !needsMicrophone || (microphoneResult.status === "fulfilled" && microphone.ready);
    const motionMessage = motionReady ? "Датчики движения готовы" : `Датчики движения: ${(motionResult as PromiseRejectedResult).reason?.message || "нет доступа"}`;
    const microphoneMessage = !needsMicrophone
      ? "микрофон для этого режима не нужен"
      : microphoneReady ? "микрофон готов" : `микрофон: ${(microphoneResult as PromiseRejectedResult).reason?.message || "нет доступа"}`;
    publishCapabilities(needsMicrophone ? `${motionMessage}; ${microphoneMessage}` : motionMessage);
    const permissionsReady = motionReady && microphoneReady;
    button.disabled = permissionsReady;
    button.textContent = permissionsReady
      ? "Датчики разрешены"
      : needsMicrophone ? "Повторить разрешение датчиков и микрофона" : "Повторить разрешение датчиков";
    el("permissions-status").textContent = permissionsReady
      ? needsMicrophone
        ? "Датчики движения и микрофон готовы"
        : "Разрешение получено. Проверяем показания датчиков…"
      : `${motionMessage}${needsMicrophone ? `; ${microphoneMessage}` : ""}`;
  };

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (scanning) stopScanner();
      if (active()) interrupt("Страница скрыта или экран заблокирован.");
    } else void updateWake();
  });
  window.addEventListener("pagehide", () => {
    stopScanner();
    sensors.stop();
    microphone.stop();
  });
  setInterval(() => {
    if (experiment === "sound" || experiment === "bottle") return;
    if (enabledAt && performance.now() - (lastEvent || enabledAt) > SENSOR_STALL_TIMEOUT_MS) {
      el("permissions-status").textContent = "Датчики не отвечают. Проверьте разрешение браузера.";
      socket?.send({ type: "status", message: "Нет событий датчиков более 10 секунд." });
      if (active()) interrupt("Нет событий датчиков более 10 секунд.");
    } else if (lastEvent && sent > 0) {
      el("permissions-status").textContent = "Датчики активны";
    }
  }, 1000);

  if (extractSessionCode(code.value)) join();
}
