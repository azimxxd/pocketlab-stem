import { LaptopSession, phoneConnectionCard, bindPairing, renderPhoneConnection, savedLaptopSession } from "./phone-connection";
import { soundFrameSchema, type SoundFrame } from "../sound/contracts";
import type { State } from "../contracts";
import "./sound.css";

export function sound(root: HTMLElement) {
  root.innerHTML = `<div class="site-shell sound-lab">
    <header class="topbar"><a class="brand" href="/" aria-label="PocketLab STEM"><img class="brand-mark" src="/pocketlab-logo.png" alt=""><strong>PocketLab</strong><span>STEM</span></a>
    <nav class="main-navigation" aria-label="Главная навигация"><a href="/pendulum">Маятник</a><a class="active" aria-current="page" href="/sound">Увидь свой голос</a><a href="/bottle">Собери музыкальный инструмент</a></nav></header>
    <main id="top"><div class="hero"><div class="hero-icon" aria-hidden="true"><img src="/sound-logo.png" alt=""></div><div class="hero-title"><h1>Увидь свой голос</h1><p>Телефон слушает звук и показывает его частоты, громкость и изменение во времени.</p></div></div>
    <div class="experiment-layout"><aside class="sidebar">${phoneConnectionCard}
    <details class="card reference-card"><summary><strong>Справочник</strong><span class="reference-chevron" aria-hidden="true">▾</span></summary><div class="reference-content">
      <div class="reference-item"><h3>Частота и высота звука</h3><p>Частота — число колебаний за секунду, в герцах. Чем выше частота основного тона, тем выше звучание.</p></div>
      <div class="reference-item"><h3>Громкость</h3><p>Показываем относительный уровень микрофона. dBFS — цифровой уровень, а не измерение звукового давления.</p></div>
      <div class="reference-item"><h3>Спектр и спектрограмма</h3><p>Спектр показывает силу разных частот сейчас. Спектрограмма сохраняет их след за последние 8 секунд: время идёт вправо, частота растёт вверх, более насыщенный цвет означает более сильный звук.</p></div>
      <div class="reference-item"><h3>Звуковая волна</h3><p>Волна показывает, как меняется сигнал микрофона за короткий промежуток времени.</p></div>
      <div class="reference-item"><h3>Почему высота не определяется</h3><p>Шум, хлопок и согласные могут не иметь устойчивого тона. Тогда вместо высоты показано тире.</p></div>
      <div class="reference-item"><h3>Чистое измерение</h3><p>Отойдите от фонового шума, не закрывайте микрофон, держите телефон на удобном расстоянии. Для измерения высоты тяните один звук.</p></div>
      <div class="reference-item"><h3>Обработка звука</h3><p>Звук обрабатывается на телефоне. Голосовые записи не сохраняются.</p></div>
    </div></details></aside>
    <div class="main-workspace is-locked" id="sound-workspace"><p id="sound-lock-hint" class="sound-lock-hint" role="status">Подключите телефон, чтобы начать измерение.</p><section class="card sound-display">
      <div class="sound-toolbar"><h2 id="view-title">Спектрограмма</h2><div class="sound-modes" role="group" aria-label="Вид звука"><button data-view="history" aria-pressed="true">Спектрограмма</button><button data-view="spectrum" aria-pressed="false">Спектр</button><button data-view="wave" aria-pressed="false">Волна</button></div></div>
      <p id="measurement-state" role="status">Подключите телефон, затем разрешите микрофон.</p>
      <canvas id="sound-graph" aria-label="График звука с телефона" role="img"></canvas>
      <div class="sound-values"><div><span>ВЫСОТА ЗВУКА</span><strong id="pitch">—</strong></div><div><span>ГРОМКОСТЬ</span><strong id="loudness">—</strong><small id="level"></small></div><div><span>СТАБИЛЬНОСТЬ</span><strong id="quality">—</strong></div></div>
      <div class="sound-actions"><button id="sound-start" class="button-primary" disabled>Начать измерение</button><button id="sound-stop" hidden>Остановить</button><button id="sound-save" disabled>Сохранить измерение</button></div>
      <section id="sound-summary" class="sound-result" aria-live="polite" hidden><span class="wizard-kicker">ИТОГИ ИЗМЕРЕНИЯ</span><h2>Ваш результат</h2><div id="sound-summary-metrics" class="sound-result-metrics"></div><p id="sound-pitch-note" class="sound-pitch-note" hidden></p></section><p class="muted">Попробуй: скажи «А-а-а», свистни, скажи звук выше или тише.</p>
    </section></div></div></main></div>`;
  const el = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const button = (id: string) => el(id) as HTMLButtonElement;
  el("availability").textContent = "Микрофон ожидает подключения";
  el("rate").hidden = true;
  let socket: LaptopSession | undefined, session = "", connected = false, ready = false;
  let state: State = "DISCONNECTED", mode = "history", frames: SoundFrame[] = [];
  let lastSequence = -1, lastTimestamp = -1, lastArrival = 0, calibrationStart = 0;
  let noiseSum = 0, noiseCount = 0, noise = -60, firstTime = 0, lastTime = 0;
  let count = 0, pitchCount = 0, pitchSum = 0, minPitch = Infinity, maxPitch = 0, maxLevel = -120;
  const active = () => state === "CALIBRATING" || state === "MEASURING";
  const pair = bindPairing(root, () => session);
  function render() {
    renderPhoneConnection(root, connected, !!socket?.connected, session);
    const workspace = el("sound-workspace");
    workspace.classList.toggle("is-locked", !connected);
    workspace.setAttribute("aria-disabled", String(!connected));
    el("sound-lock-hint").hidden = connected;
    root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(view => { view.disabled = !connected; });
    button("sound-save").disabled = !connected || active() || !count;
    button("sound-start").disabled = !connected || !ready || active();
    button("sound-start").hidden = active();
    button("sound-stop").hidden = !active();
    button("sound-save").disabled = active() || !count;
    el("availability").textContent = ready ? "Микрофон готов" : "Разрешите микрофон на телефоне";
  }
  function setState(next: State, message: string) {
    state = next;
    el("measurement-state").textContent = message;
    socket?.send({ type: "state", state, message });
    render();
  }
  function summary() {
    return { duration: count ? (lastTime - firstTime) / 1000 : 0,
      meanPitch: pitchCount ? pitchSum / pitchCount : null,
      minPitch: pitchCount ? minPitch : null, maxPitch: pitchCount ? maxPitch : null,
      maxLevel: count ? maxLevel : null, levelUnit: "dBFS", experiment: "sound" };
  }
  function stop(message: string) {
    setState("STOPPED", message);
    button("sound-start").textContent = "Начать новое измерение";
    const result = summary();
    const summaryCard = el("sound-summary");
    const metrics = el("sound-summary-metrics");
    const pitchNote = el("sound-pitch-note");
    summaryCard.hidden = !count;
    if (count) {
      const metric = (icon: string, label: string, value: string, detail = "") => `<div class="sound-result-metric"><span class="sound-result-icon" aria-hidden="true">${icon}</span><div><span class="sound-result-label">${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ""}</div></div>`;
      metrics.innerHTML = metric("◷", "Длительность", `${result.duration.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} с`)
        + metric("◖", "Пиковый уровень", `${maxLevel.toFixed(0)} dBFS`, "Относительный уровень микрофона")
        + (pitchCount ? metric("♪", "Средняя высота", `${(pitchSum / pitchCount).toFixed(0)} Гц`, `Диапазон ${minPitch.toFixed(0)}–${maxPitch.toFixed(0)} Гц`) : "");
      pitchNote.hidden = !!pitchCount;
      pitchNote.textContent = "Устойчивую высоту звука определить не удалось — попробуйте протянуть гласный звук.";
    } else metrics.innerHTML = "";
  }
  el("create").onclick = () => {
    socket?.close(); session = ""; connected = ready = false;
    if (active()) stop("Подключение изменилось. Начните новое измерение.");
    el("error").textContent = "";
    socket = new LaptopSession("sound", m => {
      if (m.type === "session") {
        session = m.code; connected = m.phoneConnected; ready = !!m.capabilities?.microphone;
        el("session").textContent = session; el("pair").hidden = false; pair();
        setState(connected ? "CONNECTED" : "DISCONNECTED", "Подключите телефон и разрешите микрофон.");
      }
      if (m.type === "capabilities") ready = m.microphone;
      if (m.type === "peer") {
        if (active()) stop("Подключение телефона изменилось. Начните новое измерение.");
        connected = m.connected; if (!connected) ready = false; lastSequence = lastTimestamp = -1;
        setState(connected ? "CONNECTED" : "DISCONNECTED", connected ? "Разрешите микрофон на телефоне." : "Телефон отключён. Измерение сохранено на экране.");
      }
      if (m.type === "sound-ready") {
        ready = m.ready;
        if (ready && !active()) el("measurement-state").textContent = "Микрофон готов. Начните измерение.";
        if (!ready && active()) stop("Микрофон отключён. Разрешите микрофон снова.");
      }
      if (m.type === "status") { el("phone-status").textContent = m.message; el("measurement-state").textContent = m.message; }
      if (m.type === "interruption" || m.type === "stop") stop(m.reason || "Остановлено с телефона.");
      if (m.type === "error") {
        el("error").textContent = m.message;
        if (active()) stop(m.message);
        if (m.message.includes("expired")) { session = ""; socket?.close(); }
      }
      if (m.type === "sound-frame" && active()) {
        const parsed = soundFrameSchema.safeParse(m.frame);
        if (!parsed.success) return;
        const frame = parsed.data;
        if (frame.sequence <= lastSequence || frame.timestamp <= lastTimestamp) return;
        lastSequence = frame.sequence; lastTimestamp = frame.timestamp; lastArrival = performance.now();
        if (state === "CALIBRATING") {
          if (!noiseCount) calibrationStart = frame.timestamp;
          noiseSum += 10 ** (frame.level / 10); noiseCount++;
          if (frame.timestamp - calibrationStart >= 1500) {
            noise = 10 * Math.log10(noiseSum / noiseCount);
            setState("MEASURING", "Готово. Издайте звук рядом с телефоном.");
          }
          return;
        }
        if (!count) firstTime = frame.timestamp;
        lastTime = frame.timestamp; count++; maxLevel = Math.max(maxLevel, frame.level);
        const audible = frame.level > Math.max(-60, noise + 6);
        const pitch = audible ? frame.pitch : null;
        if (pitch) { pitchCount++; pitchSum += pitch; minPitch = Math.min(minPitch, pitch); maxPitch = Math.max(maxPitch, pitch); }
        frames.push(frame);
        frames = frames.filter(f => f.timestamp >= frame.timestamp - 8000).slice(-180);
        el("pitch").textContent = pitch ? `${pitch.toFixed(0)} Гц` : "—";
        el("loudness").textContent = frame.level < -35 ? "Тихо" : frame.level < -15 ? "Средне" : "Громко";
        el("level").textContent = `${frame.level.toFixed(0)} dBFS`;
        const previous = frames.at(-2)?.pitch;
        el("quality").textContent = !audible ? "Слишком тихо" : !pitch ? "Шум" : previous && Math.abs(pitch - previous) / pitch > 0.05 ? "Меняется" : "Стабильный звук";
        draw();
      }
      render();
    }, online => {
      if (!online) {
        if (active()) stop("Связь потеряна. Измерение сохранено на экране.");
        connected = ready = false;
        setState("DISCONNECTED", "Повторное подключение к серверу…");
      }
      render();
    });
    render();
  };
  el("sound-start").onclick = () => {
    if (!connected || !ready) return;
    frames = []; count = pitchCount = pitchSum = noiseSum = noiseCount = 0;
    minPitch = Infinity; maxPitch = 0; maxLevel = -120; lastArrival = performance.now();
    el("sound-summary").hidden = true;
    for (const id of ["pitch", "loudness", "quality"]) el(id).textContent = "—";
    el("level").textContent = "";
    setState("CALIBRATING", "Настройка микрофона. Сохраняйте тишину…"); draw();
  };
  el("sound-stop").onclick = () => stop("Измерение завершено. Микрофон готов к следующему измерению.");
  el("sound-save").onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(summary(), null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `pocketlab-sound-${session}-${Date.now()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  root.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(b => b.onclick = () => {
    mode = b.dataset.view!; el("view-title").textContent = b.textContent;
    root.querySelectorAll("[data-view]").forEach(other => other.setAttribute("aria-pressed", String(other === b))); draw();
  });
  const canvas = el("sound-graph") as HTMLCanvasElement;
  function draw() {
    const width = canvas.clientWidth || 700, height = 350, dpr = devicePixelRatio || 1;
    canvas.width = width * dpr; canvas.height = height * dpr;
    const ctx = canvas.getContext("2d")!; ctx.scale(dpr, dpr);
    const left = 58, top = 28, w = width - 76, h = height - 70;
    ctx.fillStyle = "#fffaf4"; ctx.fillRect(left, top, w, h);
    ctx.font = "12px system-ui"; ctx.fillStyle = "#596273";
    const frame = frames.at(-1);
    ctx.fillText(mode === "wave" ? "Сигнал" : mode === "history" ? "Частота, Гц" : "Сила частоты", left, 17);
    ctx.fillText(mode === "history" ? "Время, с (последние 8 секунд)" : mode === "wave" ? "Время, мс" : "Частота, Гц", left, height - 8);
    for (let i = 0; i <= 4; i++) {
      const y = top + i * h / 4;
      ctx.strokeStyle = "#e6e2dc"; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + w, y); ctx.stroke();
      ctx.fillStyle = "#596273";
      ctx.fillText(mode === "history" ? String(Math.round((frame?.maxFrequency || 8000) * (1 - i / 4))) : mode === "wave" ? (1 - i / 2).toFixed(1) : (i === 0 ? "Сильнее" : i === 4 ? "Слабее" : ""), 3, y + 4);
      ctx.fillText(mode === "history" ? String(-8 + i * 2) : mode === "wave" ? (i / 4 * 256 / (frame?.sampleRate || 48000) * 1000).toFixed(1) : String(Math.round(i / 4 * (frame?.maxFrequency || 8000))), left + i * w / 4 - 6, top + h + 19);
    }
    if (!frame) return;
    if (mode === "history") {
      frames.forEach((f, index) => {
        const x = left + w * (1 - (frame.timestamp - f.timestamp) / 8000);
        const duration = frames[index + 1] ? frames[index + 1].timestamp - f.timestamp : 50;
        f.spectrum.forEach((db, bin) => {
          const strength = Math.max(0, Math.min(1, (db + 95) / 75));
          ctx.fillStyle = `rgba(226,99,26,${strength})`;
          ctx.fillRect(Math.min(left + w - 1, x), top + h * (1 - (bin + 1) / 128), Math.min(w * duration / 8000 + 1, left + w - x + 1), h / 128 + 0.5);
        });
      });
    } else {
      const values = mode === "wave" ? frame.waveform : frame.spectrum;
      ctx.strokeStyle = "#e87925"; ctx.lineWidth = 2; ctx.beginPath();
      values.forEach((value, i) => {
        const x = left + i / (values.length - 1) * w;
        const y = top + h * (mode === "wave" ? (1 - value) / 2 : 1 - Math.max(0, (value + 100) / 100));
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }); ctx.stroke();
    }
  }
  new ResizeObserver(draw).observe(canvas);
  setInterval(() => { if (active() && performance.now() - lastArrival > 10000) stop("Микрофон не отвечает. Разрешите его снова."); }, 1000);
  window.addEventListener("pagehide", () => socket?.close());
  render(); draw();
  if (savedLaptopSession()) button("create").click();
}
