import { LaptopSession, phoneConnectionCard, bindPairing, renderPhoneConnection, savedLaptopSession } from "./phone-connection";
import type { SocketClient } from "../socket";
import {
  axes,
  groups,
  sampleSchema,
  SENSOR_STALL_TIMEOUT_MS,
  type SensorSample,
  type State,
} from "../contracts";
import {
  SensorBuffer,
  PacketOrder,
  calibrate,
  MotionStartDetector,
  RecordingSession,
  sampleRate,
  type Calibration,
} from "../core";
import { LiveGraph } from "./graphs";
import { PhoneVisualizer } from "./visualizer";
import {
  PendulumAnalyzer,
  type PendulumAnalyzer as PendulumAnalyzerType,
} from "../pendulum";
import { PendulumGraph } from "./pendulum-graph";
import {
  estimateGravity,
  parseLengthUncertaintyCm,
  parsePendulumLengthCm,
  PHYSICS_ALGORITHM_VERSION,
  REFERENCE_GRAVITY_MS2,
} from "../physics";
import {
  analyzePendulumExperiment,
  experimentCsv,
  MINIMUM_EXPERIMENT_LENGTHS,
  PendulumExperiment,
  type ExperimentTrial,
} from "../experiment";
import { ExperimentGraph } from "./experiment-graph";
export function laptop(root: HTMLElement) {
  root.innerHTML = `<div class="site-shell">
  <header class="topbar">
    <a class="brand" href="/" aria-label="PocketLab STEM"><img class="brand-mark" src="/pocketlab-logo.png" alt=""><strong>PocketLab</strong><span>STEM</span></a>
    <nav class="main-navigation" aria-label="Главная навигация">
      <a class="active" href="/pendulum" aria-current="page">Маятник</a>
      <a href="/sound">Увидь свой голос</a>
      <a href="/bottle">Собери музыкальный инструмент</a>
      <a href="#top">Кнопка 5</a>
    </nav>
  </header>
  <main id="top">
    <div class="hero"><div class="hero-icon" aria-hidden="true"><img src="/pendulum-logo.png" alt=""></div><div class="hero-title"><h1>Маятник</h1><p>Телефон выступает в роли датчика и автоматически измеряет колебания маятника.</p><span id="friendly-state" class="visually-hidden">Подключите телефон</span><span id="message" class="visually-hidden">Создайте сессию и подключите телефон.</span><span id="state" class="visually-hidden">Ожидание</span></div></div>
    <div class="experiment-layout">
      <aside class="sidebar">
        ${phoneConnectionCard}
        <section class="card visual-card"><h2>Вид в реальном времени</h2><div id="visualizer"></div><p id="orientation-status" class="muted">Ожидание ориентации</p></section>
        <details id="reference" class="card reference-card">
          <summary><strong>Справочник</strong><span class="reference-chevron" aria-hidden="true">▾</span></summary>
          <div class="reference-content">
            <div class="reference-item"><h3>Что такое период</h3><p>Период <i>T</i> — время одного полного колебания: маятник возвращается в исходное положение и продолжает движение в ту же сторону.</p></div>
            <div class="reference-item"><h3>Что такое частота</h3><p><i>f = 1 / T</i>. Частота показывает, сколько колебаний происходит за одну секунду.</p></div>
            <div class="reference-item"><h3>Что такое <i>g</i></h3><p>Это ускорение свободного падения. Справочное значение у поверхности Земли — около <strong>9,81 м/с²</strong>. Измеренное значение рассчитывается по вашему опыту и показывается отдельно.</p></div>
            <div class="reference-item"><h3>Как правильно измерять длину маятника</h3><p>Измеряйте от точки подвеса до центра масс телефона вместе с держателем. Это эффективная длина маятника.</p></div>
            <div class="reference-item"><h3>Почему результат может отличаться</h3><p>Причины: неточная длина, большой угол, закручивание нити или движение вбок, плохая калибровка, мало колебаний или нестабильный сигнал датчика.</p></div>
            <div class="reference-item"><h3>Что показывает график</h3><p>Линия показывает движение маятника по датчику, а отметки T1, T2, T3… — найденные полные периоды.</p></div>
            <div class="reference-item"><h3>Как получить более точный результат</h3><ul><li>Начинайте с небольшого угла.</li><li>Точно измерьте эффективную длину.</li><li>Дайте маятнику свободно качаться.</li><li>Не трогайте телефон во время записи.</li><li>Запишите несколько полных колебаний.</li><li>Повторите опыт.</li></ul></div>
          </div>
        </details>
        <span id="recording" hidden></span>
      </aside>
      <div class="main-workspace">
        <section class="card stage-card" aria-label="Этапы эксперимента">
          <div class="stage" id="stage-connect"><span class="stage-icon">1</span><div><strong>Телефон</strong><small>Подключение</small></div></div><span class="stage-arrow">›</span>
          <div class="stage" id="stage-calibration"><span class="stage-icon">2</span><div><strong>Калибровка</strong><small>Положение покоя</small></div></div><span class="stage-arrow">›</span>
          <div class="stage" id="stage-setup"><span class="stage-icon">3</span><div><strong>Подготовка</strong><small>Длина и запуск</small></div></div><span class="stage-arrow">›</span>
          <div class="stage" id="stage-measurement"><span class="stage-icon">4</span><div><strong>Измерение</strong><small>Запись движений</small></div></div><span class="stage-arrow">›</span>
          <div class="stage" id="stage-result"><span class="stage-icon">5</span><div><strong>Результат</strong><small>Период и g</small></div></div><button id="stop" class="button-secondary" disabled hidden>Остановить</button>
        </section>
        <section id="stage-locked" class="card wizard-panel locked-panel"><span class="wizard-kicker">ШАГ 1 · ПОДКЛЮЧЕНИЕ</span><h2>Подключите телефон, чтобы начать</h2><p>Создайте сессию в карточке слева и откройте QR-код. Когда датчики подключатся, этапы измерения станут доступны.</p><span class="locked-mark">● ━ ● ━ ● ━ ● ━ ●</span></section>
        <section id="calibration-panel" class="card wizard-panel" hidden><span class="wizard-kicker">ШАГ 2 · КАЛИБРОВКА</span><h2>Положите телефон неподвижно</h2><p>Снимем положение покоя и шум гироскопа. Не трогайте маятник около трёх секунд.</p><div class="calibration-visual"><div class="calibration-orbit"><span>⌖</span></div><div><strong id="calibration-status">Датчик готов к настройке</strong><small>Пусть телефон спокойно висит вертикально</small></div></div><pre id="calibration" hidden>—</pre><div class="wizard-actions"><button id="start" class="button-primary" disabled>Начать калибровку</button><button id="continue-calibration" class="button-primary" hidden>Продолжить</button><button id="retry-calibration" class="button-secondary" hidden>Повторить калибровку</button></div></section>
        <section id="setup-panel" class="card wizard-panel" hidden><span class="wizard-kicker">ШАГ 3 · ПОДГОТОВКА</span><h2>Измерьте длину маятника</h2><p>Расстояние от точки подвеса до центра телефона задаёт точность результата.</p><div class="measurement-setup"><label>Длина<div class="length-entry"><input id="length-cm" inputmode="decimal" placeholder="например, 50" aria-label="Длина маятника в сантиметрах" aria-describedby="length-error"><span>см</span></div></label><details class="optional-length"><summary>Неопределённость</summary><label><input id="length-sigma-cm" inputmode="decimal" placeholder="например, 0,5" aria-label="Неопределённость длины в сантиметрах"> см</label></details></div><p id="length-error" class="field-error" role="alert"></p><div class="wizard-actions"><button id="begin-measurement" class="button-primary">Подготовить измерение</button></div></section>
        <section id="awaiting-panel" class="card wizard-panel" hidden><span class="wizard-kicker">ШАГ 4 · ЗАПИСЬ</span><h2>Отведите маятник и отпустите</h2><p>Измерение начнётся автоматически, когда датчик заметит устойчивое движение.</p><div class="waiting-indicator"><i></i><i></i><i></i><i></i><i></i></div><button id="cancel-wait" class="button-secondary">Назад к подготовке</button></section>
        <section id="graph-card" class="card graph-card" hidden><div class="section-heading"><div><span class="wizard-kicker">ШАГ 4 · ЗАПИСЬ</span><h2>Колебания маятника</h2></div><div class="graph-legend"><span><i></i> Сигнал</span><span><i></i> Найденные периоды</span></div></div><canvas id="pendulum-graph" aria-label="График колебаний маятника"></canvas><p id="pendulum-quality" class="quality-message">Ожидание движения.</p></section>
        <section id="results-card" class="card results-card" hidden><span class="wizard-kicker">ШАГ 5 · РЕЗУЛЬТАТ</span><h2>Результаты измерения</h2><div class="result-metrics"><div class="metric"><span class="metric-icon">◷</span><div><h3>Период</h3><strong id="pendulum-period">—</strong></div></div><div class="metric"><span class="metric-icon">∿</span><div><h3>Частота</h3><strong id="pendulum-frequency">—</strong></div></div><div class="metric"><span class="metric-icon">↕</span><div><h3>Полных колебаний</h3><strong id="pendulum-count">0</strong></div></div><div class="metric metric-gravity"><span class="metric-icon">↓</span><div><h3>Ускорение свободного падения</h3><strong id="gravity-summary">—</strong></div></div></div><div class="result-lower"><div id="gravity-result" class="gravity-result" hidden><h3>Расчёт ускорения свободного падения</h3><strong id="gravity-value"></strong><p id="gravity-calculation" class="gravity-formula"></p><p id="gravity-length"></p><p id="gravity-reference"></p><p id="gravity-uncertainty" class="muted"></p></div><div class="tip-card interpretation-card"><span class="tip-icon" aria-hidden="true">♧</span><div><h3>Оценка результата</h3><p>Справочное значение около 9,81 м/с². Проверьте длину до центра телефона и отсутствие толчков.</p></div></div></div><details class="secondary measurement-details"><summary>Подробности</summary><p>Разброс периода: <strong id="pendulum-spread">—</strong></p><p>Главная ось гироскопа: <strong id="pendulum-axis">—</strong></p><p id="pendulum-duration"></p><details><summary>Отдельные периоды</summary><ol id="period-list"></ol></details></details><div class="wizard-actions"><button id="save-trial" class="button-primary" hidden>Сохранить результат в серию</button><button id="discard-trial" class="button-secondary" hidden>Отбросить</button><button id="next-trial" class="button-secondary" hidden>Новое измерение</button></div></section>
        <section id="experiment-panel" class="card series-card"><div class="section-heading"><div><h2>Серия измерений</h2><p id="experiment-progress">Сохранено измерений: 0 · разных длин в анализе: 0 / 4</p></div><div class="export-actions"><button id="download" class="button-secondary" disabled>Экспорт JSON</button><button id="download-csv" class="button-secondary" disabled>Экспорт CSV</button></div></div><p id="experiment-needed">Сохраните измерения минимум для четырёх разных длин.</p><div class="table-scroll"><table id="experiment-table"><thead><tr><th>Длина, м</th><th>Период-медиана, с</th><th>Частота, Гц</th><th>Циклы</th><th>Повторы</th></tr></thead><tbody id="experiment-conditions"></tbody></table></div><div id="experiment-graphs" class="experiment-graphs" hidden><div><h3>Период T (с) от длины L (м)</h3><canvas id="graph-t-l" aria-label="Измеренные периоды в зависимости от длины"></canvas></div><div><h3>Квадрат периода T² (с²) от длины L (м)</h3><canvas id="graph-t2-l" aria-label="Квадрат измеренного периода в зависимости от длины"></canvas></div></div><div id="series-result" class="series-result" hidden><h3>Оценка g по серии измерений</h3><strong id="series-gravity"></strong><p id="series-reference"></p><p id="series-fit-details" class="muted"></p><details><summary>Остатки линейной аппроксимации</summary><div class="table-scroll"><table><thead><tr><th>Длина, м</th><th>Наблюдаемое T², с²</th><th>Расчётное T², с²</th><th>Остаток, с²</th></tr></thead><tbody id="series-residuals"></tbody></table></div></details></div></section>
        <details class="advanced card" id="sensor-data"><summary id="sensor-data-summary">Технические данные датчиков</summary><section><h2>Текущие значения</h2><div class="values">${groups.map((g) => `<div><h3>${({ acceleration: "Ускорение", accelerationIncludingGravity: "Ускорение с гравитацией", rotationRate: "Гироскоп", orientation: "Ориентация" } as Record<string, string>)[g] ?? g}</h3><pre id="values-${g}">—</pre></div>`).join("")}</div><p class="muted">Ускорение: м/с² · Гироскоп и ориентация: °</p></section><section><h2>Датчики · последние 15 с</h2><canvas id="accel"></canvas><canvas id="gyro"></canvas></section><details><summary>Служебная диагностика</summary><p id="diagnostics"></p><pre id="latest">Пакетов пока нет</pre></details></details>
      </div>
    </div>
  </main></div>`;
  const el = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const button = (id: string) => el(id) as HTMLButtonElement;
  root.querySelectorAll<HTMLAnchorElement>(".topbar nav a[href^='#']").forEach((link) =>
    link.addEventListener("click", () => {
      const target = document.querySelector(link.hash);
      if (target instanceof HTMLDetailsElement) target.open = true;
    }),
  );
  el("sensor-data-summary").addEventListener("click", (event) => {
    if (!phoneConnected) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
  let uiStage: "connect" | "calibration" | "setup" | "awaiting" | "measurement" | "result" | "series" = "connect";
  let socket: SocketClient | undefined,
    session = "",
    phoneConnected = false,
    state: State = "DISCONNECTED",
    userAgent = "";
  let buffer = new SensorBuffer(),
    order = new PacketOrder(),
    latest: SensorSample | undefined,
    motion: SensorSample | undefined,
    orientation: SensorSample | undefined;
  let lastArrival = 0,
    lastMotionArrival = 0,
    lastOrientationArrival = 0,
    calibrationSamples: SensorSample[] = [],
    calibration: Calibration | undefined,
    detector: MotionStartDetector | undefined,
    pendulum: PendulumAnalyzerType | undefined;
  let recording: RecordingSession | undefined,
    calibrationStarted = 0,
    readyAt = 0,
    invalid = 0;
  let measurementLength:
    { lengthMeters: number; uncertaintyMeters?: number } | undefined;
  const experiment = new PendulumExperiment();
  const active = () =>
    ["CALIBRATING", "READY", "WAITING_FOR_MOTION", "MEASURING"].includes(state);
  function setState(next: State, message: string) {
    state = next;
    el("state").textContent = next;
    el("friendly-state").textContent =
      ({
        DISCONNECTED: "Нет подключения",
        CONNECTED: "Телефон подключён",
        CALIBRATING: "Калибровка",
        READY: "Датчик настроен",
        WAITING_FOR_MOTION: "Ожидание движения",
        MEASURING: "Идёт измерение",
        STOPPED: "Измерение завершено",
        ERROR: "Нужна проверка",
      } satisfies Record<State, string>)[next];
    el("message").textContent = message;
    socket?.send({ type: "state", state: next, message });
  }
  function stop(reason: string, next: State = "STOPPED") {
    recording?.stop(reason);
    pendulum?.finish();
    if (recording?.endedAt) uiStage = "result";
    setState(next, reason);
  }
  function resetStream() {
    buffer = new SensorBuffer();
    order = new PacketOrder();
    latest = motion = orientation = undefined;
    lastArrival = lastMotionArrival = lastOrientationArrival = 0;
  }
  const pair = bindPairing(root, () => session);
  el("create").onclick = () => {
    socket?.close();
    session = "";
    phoneConnected = false;
    resetStream();
    el("error").textContent = "";
    socket = new LaptopSession(
      "pendulum",
      (m) => {
        if (m.type === "session") {
          session = m.code;
          phoneConnected = m.phoneConnected;
          uiStage = phoneConnected ? "calibration" : "connect";
          userAgent = m.userAgent || userAgent;
          el("session").textContent = session;
          el("pair").hidden = false;
          pair();
          setState(
            phoneConnected ? "CONNECTED" : "DISCONNECTED",
            phoneConnected
              ? "Телефон подключён. Положите его неподвижно."
              : "Откройте ссылку на телефоне и подключитесь.",
          );
        }
        if (m.type === "peer") {
          if (!m.connected) {
            phoneConnected = false;
            uiStage = "connect";
            if (active())
              stop(
                "Телефон отключён. Запись сохранена в памяти.",
                "DISCONNECTED",
              );
            else setState("DISCONNECTED", "Телефон отключён.");
          } else {
            if (active())
              stop("Подключение телефона изменилось. Начните новое измерение.");
            phoneConnected = true;
            uiStage = "calibration";
            userAgent = m.userAgent || "";
            resetStream();
            setState(
              "CONNECTED",
              "Телефон подключён. Разрешите датчики и положите его неподвижно.",
            );
          }
        }
        if (m.type === "sample") {
          const parsed = sampleSchema.safeParse(m.sample);
          if (!parsed.success) {
            invalid++;
            return;
          }
          const s = parsed.data;
          // Preserve every valid packet received during measurement, even duplicate/out-of-order packets.
          if (state === "MEASURING") recording?.add(s);
          if (!order.accept(s)) return;
          if (latest && s.timestamp < latest.timestamp) {
            if (active())
              stop(
                "Время датчика пошло назад. Начните новое измерение.",
                "ERROR",
              );
            return;
          }
          const gap = latest ? s.timestamp - latest.timestamp : 0;
          if (active() && gap > SENSOR_STALL_TIMEOUT_MS) {
            stop("Поток датчиков прерван более чем на 10 секунд.", "ERROR");
          }
          latest = s;
          lastArrival = performance.now();
          buffer.add(s);
          if (s.source === "motion") {
            motion = s;
            lastMotionArrival = lastArrival;
          } else {
            orientation = s;
            lastOrientationArrival = lastArrival;
          }
          if (state === "CALIBRATING") {
            calibrationSamples.push(s);
            if (s.timestamp - calibrationSamples[0].timestamp >= 2600) {
              calibration = calibrate(calibrationSamples);
              el("calibration").textContent = JSON.stringify(
                calibration,
                null,
                2,
              );
              if (!calibration.stable) {
                setState("ERROR", calibration.reason);
                el("calibration-status").textContent = "Калибровка не удалась";
                return;
              }
              detector = new MotionStartDetector(calibration);
              readyAt = performance.now();
              setState("READY", calibration.reason);
              el("calibration-status").textContent = "Калибровка завершена";
            }
          } else if (
            state === "WAITING_FOR_MOTION" &&
            detector?.update(s)
          ) {
            recording = new RecordingSession(session, calibration!, userAgent);
            recording.add(s);
            pendulum = new PendulumAnalyzer(calibration!);
            pendulum.add(s);
            uiStage = "measurement";
            setState("MEASURING", "ИЗМЕРЕНИЕ — запись сырых данных.");
          } else if (state === "MEASURING" && s.source === "motion") {
            pendulum?.add(s);
          }
        }
        if (m.type === "status") el("phone-status").textContent = m.message;
        if (m.type === "capabilities")
          el("availability").textContent = [m.motion ? "Движение готово" : "Движение недоступно", m.microphone ? "микрофон готов" : "микрофон не разрешён"].join(" · ");
        if (m.type === "interruption") {
          if (active()) stop(m.reason, "ERROR");
          else el("phone-status").textContent = m.reason;
        }
        if (m.type === "stop") stop("Остановлено с телефона.");
        if (m.type === "error") {
          el("error").textContent = m.message;
          if (active()) stop(m.message, "ERROR");
          if (m.message.includes("expired")) {
            session = "";
            socket?.close();
          }
        }
      },
      (connected) => {
        if (!connected) {
          phoneConnected = false;
          if (active())
            stop(
              "Связь с сервером потеряна. Запись сохранена.",
              "DISCONNECTED",
            );
          else setState("DISCONNECTED", "Повторное подключение к серверу…");
        }
      },
    );
  };
  el("start").onclick = () => {
    if (!phoneConnected || !latest) return;
    if (
      recording?.samples.length &&
      !recording.endedAt &&
      !confirm("Начать новую калибровку? Текущая запись будет завершена.")
    ) return;
    recording = undefined;
    calibrationSamples = [];
    calibration = undefined;
    detector = undefined;
    pendulum = undefined;
    measurementLength = undefined;
    uiStage = "calibration";
    el("calibration-status").textContent = "Считываем датчики…";
    el("calibration").textContent = "Сбор данных…";
    calibrationStarted = performance.now();
    setState("CALIBRATING", "Держите телефон неподвижно около 3 секунд.");
  };
  el("continue-calibration").onclick = () => {
    if (!calibration?.stable) return;
    uiStage = "setup";
    setState("CONNECTED", "Калибровка пройдена. Укажите длину маятника.");
  };
  el("begin-measurement").onclick = () => {
    const length = parsePendulumLengthCm(
        (el("length-cm") as HTMLInputElement).value,
      ),
      uncertainty = parseLengthUncertaintyCm(
        (el("length-sigma-cm") as HTMLInputElement).value,
      );
    if (!length.valid || !uncertainty.valid) {
      el("length-error").textContent = !length.valid
        ? length.reason
        : !uncertainty.valid
          ? uncertainty.reason
          : "Проверьте длину маятника.";
      (
        el(!length.valid ? "length-cm" : "length-sigma-cm") as HTMLInputElement
      ).focus();
      return;
    }
    recording = undefined;
    pendulum = undefined;
    measurementLength = {
      lengthMeters: length.lengthMeters,
      ...(uncertainty.uncertaintyMeters === undefined
        ? {}
        : { uncertaintyMeters: uncertainty.uncertaintyMeters }),
    };
    el("length-error").textContent = "";
    el("gravity-result").hidden = true;
    detector = new MotionStartDetector(calibration!);
    uiStage = "awaiting";
    setState(
      "WAITING_FOR_MOTION",
      "Отведите маятник и отпустите его без толчка.",
    );
  };
  el("cancel-wait").onclick = () => {
    uiStage = "setup";
    setState("CONNECTED", "Можно проверить длину и подготовить маятник.");
  };
  el("retry-calibration").onclick = () => button("start").click();
  function currentTrialPayload() {
    if (!recording) return undefined;
    const result = pendulum?.result(),
      length = measurementLength,
      gravity =
        length && result && result.periodSec !== null
          ? estimateGravity({
              lengthMeters: length.lengthMeters,
              periodSeconds: result.periodSec,
              ...(length.uncertaintyMeters === undefined
                ? {}
                : {
                    lengthUncertaintyMeters: length.uncertaintyMeters,
                  }),
              ...(result.spreadSec === null || result.spreadSec === 0
                ? {}
                : { periodUncertaintySeconds: result.spreadSec }),
            })
          : undefined;
    return {
      session,
      recording: recording.export(),
      pendulum: pendulum?.export() ?? null,
      pendulumLengthMeters: measurementLength?.lengthMeters ?? null,
      optionalLengthUncertaintyMeters:
        measurementLength?.uncertaintyMeters ?? null,
      periodEstimateSeconds: result?.periodSec ?? null,
      periodSpreadSeconds: result?.spreadSec ?? null,
      frequencyHz: result?.frequencyHz ?? null,
      completePeriods: result?.completePeriods ?? 0,
      quality: result?.quality ?? "Нет данных",
      gravityEstimateMs2: gravity?.valid === true ? gravity.gravityMs2 : null,
      optionalGravityUncertaintyMs2:
        gravity?.valid === true ? (gravity.uncertaintyMs2 ?? null) : null,
      referenceGravityMs2: REFERENCE_GRAVITY_MS2,
      relativeDifferencePercent:
        gravity?.valid === true ? gravity.relativeDifferencePercent : null,
      gravityFormula: "g = 4π²L / T²",
      gravityAlgorithmVersion: PHYSICS_ALGORITHM_VERSION,
      diagnostics: {
        missingPackets: order.missing,
        outOfOrder: order.outOfOrder,
        invalidPackets: invalid,
      },
    };
  }
  el("stop").onclick = () => {
    if (!recording && state === "WAITING_FOR_MOTION") uiStage = "setup";
    stop(state === "CALIBRATING" ? "Калибровка остановлена." : "Измерение остановлено. Проверьте результат.");
  };
  el("save-trial").onclick = () => {
    const payload = currentTrialPayload();
    if (
      !payload ||
      payload.pendulumLengthMeters === null ||
      payload.periodEstimateSeconds === null ||
      payload.frequencyHz === null ||
      !payload.pendulum
    )
      return;
    experiment.addTrial({
      lengthMeters: payload.pendulumLengthMeters as number,
      lengthUncertaintyMeters: payload.optionalLengthUncertaintyMeters,
      periodSeconds: payload.periodEstimateSeconds,
      periodSpreadSeconds: payload.periodSpreadSeconds,
      frequencyHz: payload.frequencyHz,
      completePeriods: payload.completePeriods,
      quality: payload.quality,
      individualGravityEstimateMs2: payload.gravityEstimateMs2,
      individualGravityUncertaintyMs2: payload.optionalGravityUncertaintyMs2,
      referenceGravityMs2: payload.referenceGravityMs2,
      relativeDifferencePercent: payload.relativeDifferencePercent,
      gravityAlgorithmVersion: payload.gravityAlgorithmVersion,
      recording: payload.recording,
      pendulum: payload.pendulum,
    });
    recording = undefined;
    uiStage = "series";
    setState(
      "STOPPED",
      "Измерение сохранено. Можно перейти к следующей длине.",
    );
    renderStages();
    renderExperiment();
  };
  el("discard-trial").onclick = () => {
    if (
      !confirm(
        "Отбросить несохранённое измерение? Его сырые данные не попадут в серию.",
      )
    )
      return;
    recording = undefined;
    pendulum = undefined;
    uiStage = "setup";
    setState(
      phoneConnected ? "CONNECTED" : "DISCONNECTED",
      phoneConnected
        ? "Измерение отброшено. Можно изменить длину и повторить."
        : "Измерение отброшено. Подключите телефон для повтора.",
    );
    renderExperiment();
  };
  el("next-trial").onclick = () => {
    recording = undefined;
    pendulum = undefined;
    calibration = undefined;
    detector = undefined;
    calibrationSamples = [];
    measurementLength = undefined;
    uiStage = "calibration";
    setState("CONNECTED", "Телефон подключён. Положите его неподвижно.");
  };
  for (const id of ["length-cm", "length-sigma-cm"])
    el(id).addEventListener("input", () => {
      el("length-error").textContent = "";
    });
  el("download").onclick = () => {
    if (!recording?.endedAt && experiment.trials.length === 0) return;
    const blob = new Blob(
      [JSON.stringify(experiment.export(currentTrialPayload()), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `pocketlab-experiment-${session || "draft"}-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  el("download-csv").onclick = () => {
    const blob = new Blob([experimentCsv(experiment.trials)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `pocketlab-series-${session || "draft"}-${Date.now()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const graphs = [
    new LiveGraph(el("accel") as HTMLCanvasElement, "acceleration"),
    new LiveGraph(el("gyro") as HTMLCanvasElement, "rotationRate"),
  ];
  const pendulumGraph = new PendulumGraph(
    el("pendulum-graph") as HTMLCanvasElement,
  );
  const periodLengthGraph = new ExperimentGraph(
      el("graph-t-l") as HTMLCanvasElement,
      false,
    ),
    squaredPeriodLengthGraph = new ExperimentGraph(
      el("graph-t2-l") as HTMLCanvasElement,
      true,
    );
  function renderExperiment() {
    const analysis = analyzePendulumExperiment(experiment.trials),
      allByLength = new Map<number, ExperimentTrial[]>();
    for (const trial of experiment.trials) {
      const trials = allByLength.get(trial.lengthMeters) ?? [];
      trials.push(trial);
      allByLength.set(trial.lengthMeters, trials);
    }
    el("experiment-progress").textContent =
      `Сохранено измерений: ${experiment.trials.length} · разных длин в анализе: ${analysis.distinctLengthCount} / ${MINIMUM_EXPERIMENT_LENGTHS}`;
    el("experiment-needed").hidden = !!analysis.fit;
    el("experiment-needed").textContent =
      `Нужно больше разных длин для анализа зависимости (минимум ${MINIMUM_EXPERIMENT_LENGTHS}).`;
    el("experiment-table").hidden = experiment.trials.length === 0;
    const conditionsByLength = new Map(
      analysis.conditions.map((condition) => [
        condition.lengthMeters,
        condition,
      ]),
    );
    el("experiment-conditions").innerHTML = [...allByLength.entries()]
      .sort(([a], [b]) => a - b)
      .map(([lengthMeters, trials]) => {
        const condition = conditionsByLength.get(lengthMeters),
          excludedCount = trials.filter((trial) => trial.excluded).length,
          repeatRows = trials
            .map(
              (trial) =>
                `<li class="${trial.excluded ? "excluded-trial" : ""}"><span>${trial.periodSeconds.toFixed(3)} с · ${trial.completePeriods} циклов${trial.exclusionReason ? ` · ${trial.exclusionReason}` : ""}</span><button type="button" data-trial-action="${trial.excluded ? "restore" : "exclude"}" data-trial-id="${trial.id}">${trial.excluded ? "Вернуть" : "Исключить"}</button></li>`,
            )
            .join("");
        return `<tr><td>${lengthMeters.toFixed(3)}</td><td>${condition?.periodSeconds.toFixed(3) ?? "—"}</td><td>${condition?.frequencyHz.toFixed(3) ?? "—"}</td><td>${condition?.completePeriods ?? 0}</td><td><details class="repeat-details"><summary>${trials.length} повт. · исключено ${excludedCount}</summary><ul>${repeatRows}</ul></details></td></tr>`;
      })
      .join("");
    el("experiment-conditions")
      .querySelectorAll<HTMLDetailsElement>(".repeat-details")
      .forEach((details) => {
        details.addEventListener("toggle", () => {
          if (!details.open) return;
          const summary = details.querySelector("summary")!,
            list = details.querySelector("ul")!,
            rect = summary.getBoundingClientRect(),
            width = Math.min(360, window.innerWidth - 24);
          list.style.width = `${width}px`;
          list.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
          list.style.top = `${Math.max(12, Math.min(rect.bottom + 8, window.innerHeight - list.offsetHeight - 12))}px`;
        });
      });
    const hasConditions = analysis.conditions.length > 0;
    el("experiment-graphs").hidden = !hasConditions;
    periodLengthGraph.draw(analysis.conditions, analysis);
    squaredPeriodLengthGraph.draw(analysis.conditions, analysis);
    el("series-result").hidden = !analysis.fit;
    if (analysis.fit) {
      const fit = analysis.fit;
      el("series-gravity").textContent =
        fit.gravityEstimateMs2 === null
          ? "Наклон не положительный — g по серии не вычисляется"
          : `${fit.gravityEstimateMs2.toFixed(2)} м/с²`;
      el("series-reference").textContent =
        fit.gravityEstimateMs2 === null
          ? `Справочное значение: ≈${REFERENCE_GRAVITY_MS2.toFixed(2)} м/с²`
          : `Справочно: ≈${REFERENCE_GRAVITY_MS2.toFixed(2)} м/с² · отклонение ${(fit.gravityEstimateMs2 > REFERENCE_GRAVITY_MS2 ? "+" : "") + (fit.gravityEstimateMs2 - REFERENCE_GRAVITY_MS2).toFixed(2)} м/с² (${((Math.abs(fit.gravityEstimateMs2 - REFERENCE_GRAVITY_MS2) / REFERENCE_GRAVITY_MS2) * 100).toFixed(1)}%)`;
      el("series-fit-details").textContent =
        `g = 4π² / a · a = ${fit.slopeSecondsSquaredPerMeter.toFixed(4)} с²/м · b = ${fit.interceptSecondsSquared.toFixed(4)} с² · R² = ${fit.rSquared?.toFixed(4) ?? "—"} · RMSE = ${fit.rmseSecondsSquared.toFixed(4)} с²${fit.rSquared !== null && fit.rSquared < 0.9 ? " · Точки заметно отклоняются от прямой; проверьте серию измерений." : ""}`;
      el("series-residuals").innerHTML = fit.residuals
        .map(
          (residual) =>
            `<tr><td>${residual.lengthMeters.toFixed(3)}</td><td>${residual.observedPeriodSquaredSeconds2.toFixed(4)}</td><td>${residual.fittedPeriodSquaredSeconds2.toFixed(4)}</td><td>${residual.residualSeconds2 >= 0 ? "+" : ""}${residual.residualSeconds2.toFixed(4)}</td></tr>`,
        )
        .join("");
    }
    button("download").disabled =
      !recording?.endedAt && experiment.trials.length === 0;
    button("download-csv").disabled = experiment.trials.length === 0;
    el("experiment-panel").hidden = uiStage !== "series";
  }
  function renderStages() {
    const current = ({ connect: 0, calibration: 1, setup: 2, awaiting: 3, measurement: 3, result: 4, series: 4 } as const)[uiStage];
    const completed = uiStage === "series" ? 5 : uiStage === "result" ? 4 : uiStage === "measurement" ? 3 : uiStage === "awaiting" ? 3 : uiStage === "setup" ? 2 : uiStage === "calibration" && state === "READY" ? 1 : 0;
    ["connect", "calibration", "setup", "measurement", "result"].forEach((name, index) => {
      const stage = el(`stage-${name}`);
      stage.classList.toggle("is-active", phoneConnected && index === current && uiStage !== "series");
      stage.classList.toggle("is-complete", phoneConnected && index < completed || phoneConnected && index === 0);
      stage.classList.toggle("is-locked", !phoneConnected);
    });
    el("stage-locked").hidden = uiStage !== "connect";
    el("calibration-panel").hidden = uiStage !== "calibration";
    el("setup-panel").hidden = uiStage !== "setup";
    el("awaiting-panel").hidden = uiStage !== "awaiting";
    el("graph-card").hidden = uiStage !== "measurement";
    el("results-card").hidden = uiStage !== "result" && uiStage !== "series";
    el("experiment-panel").hidden = uiStage !== "series";
    button("start").hidden = state === "CALIBRATING" || state === "READY" || state === "ERROR";
    button("continue-calibration").hidden = state !== "READY";
    button("retry-calibration").hidden = state !== "ERROR";
    button("stop").hidden = !active();
    button("next-trial").hidden = uiStage !== "series" && !(uiStage === "result" && !recording && experiment.trials.length > 0);
    button("save-trial").hidden = !(uiStage === "result" && recording?.endedAt && measurementLength && pendulum?.result().periodSec != null);
    button("discard-trial").hidden = !(uiStage === "result" && recording?.endedAt);
  }
  renderExperiment();
  el("experiment-conditions").addEventListener("click", (event) => {
    const target = event.target as HTMLElement,
      control = target.closest<HTMLButtonElement>("button[data-trial-action]");
    if (!control) return;
    const id = control.dataset.trialId;
    if (!id) return;
    if (control.dataset.trialAction === "exclude") experiment.excludeTrial(id);
    else experiment.restoreTrial(id);
    renderExperiment();
  });
  let visualizer: PhoneVisualizer | undefined;
  try {
    visualizer = new PhoneVisualizer(el("visualizer"));
  } catch {
    el("visualizer").textContent =
      "WebGL недоступен. Включите аппаратное ускорение браузера для 3D.";
  }
  let lastRender = 0;
  function frame(now: number) {
    requestAnimationFrame(frame);
    if (now - lastRender < 33) return;
    lastRender = now;
    if (
      active() &&
      lastArrival &&
      now - lastArrival > SENSOR_STALL_TIMEOUT_MS
    )
      stop("Нет пакетов более 10 секунд. Проверьте телефон и сеть.", "ERROR");
    if (
      active() &&
      lastMotionArrival &&
      now - lastMotionArrival > SENSOR_STALL_TIMEOUT_MS
    )
      stop("Поток DeviceMotion остановился более чем на 10 секунд.", "ERROR");
    if (state === "CALIBRATING" && now - calibrationStarted > 6500)
      setState(
        "ERROR",
        "Недостаточно данных. Проверьте разрешения датчиков и повторите.",
      );
    if (state === "ERROR" && uiStage === "calibration") el("calibration-status").textContent = "Калибровка не удалась — попробуйте ещё раз";
    renderStages();
    const freshMotion =
        motion && now - lastMotionArrival < 2000 ? motion : undefined,
      freshOrientation =
        orientation && now - lastOrientationArrival < 2000
          ? orientation
          : undefined;
    renderPhoneConnection(root, phoneConnected, !!socket?.connected, session);
    el("sensor-data").classList.toggle("is-locked", !phoneConnected);
    el("sensor-data").setAttribute("aria-disabled", String(!phoneConnected));
    el("sensor-data-summary").setAttribute("aria-disabled", String(!phoneConnected));
    el("sensor-data-summary").setAttribute("tabindex", phoneConnected ? "0" : "-1");
    button("start").disabled = !phoneConnected || !freshMotion || active();
    button("stop").disabled = !active();
    button("download").disabled =
      !recording?.endedAt && experiment.trials.length === 0;
    button("download-csv").disabled = experiment.trials.length === 0;
    (el("length-cm") as HTMLInputElement).disabled =
      active() || !!recording?.endedAt;
    (el("length-sigma-cm") as HTMLInputElement).disabled =
      active() || !!recording?.endedAt;
    const available = (g: (typeof groups)[number]) => {
      const s = g === "orientation" ? freshOrientation : freshMotion;
      return s
        ? axes[g].some((a) => (s[g] as Record<string, unknown>)[a] !== null)
          ? "есть"
          : "недоступен"
        : "нет данных";
    };
    el("availability").textContent =
      `Акселерометр: ${available("accelerationIncludingGravity")} · Гироскоп: ${available("rotationRate")} · Ориентация: ${available("orientation")}`;
    const rate =
      lastArrival && now - lastArrival < 2000
        ? sampleRate(
            buffer.samples.filter(
              (s) => s.timestamp > (latest?.timestamp ?? 0) - 3000,
            ),
          )
        : null;
    el("rate").textContent =
      `Частота датчиков: ${rate?.toFixed(1) ?? "—"} Гц · Задержка сервера: ${socket?.latency?.toFixed(0) ?? "—"} мс`;
    for (const g of groups) {
      const s = g === "orientation" ? freshOrientation : freshMotion;
      el(`values-${g}`).textContent = axes[g]
        .map(
          (a) =>
            `${a}: ${s ? ((s[g] as Record<string, number | null>)[a]?.toFixed(3) ?? "—") : "—"}`,
        )
        .join("\n");
    }
    el("recording").textContent =
      `Recorded packets: ${recording?.samples.length ?? 0}${recording?.endedAt ? " · preserved in memory until new recording or page reload" : ""}`;
    el("diagnostics").textContent =
      `Packets: ${order.received} · Last sequence: ${order.last} · Missing: ${order.missing} · Out of order: ${order.outOfOrder} · Invalid: ${invalid} · Last packet age: ${lastArrival ? Math.round(now - lastArrival) + " ms" : "—"}`;
    el("latest").textContent = latest
      ? JSON.stringify(latest, null, 2)
      : "No packets received";
    const complete =
      freshOrientation &&
      ["alpha", "beta", "gamma"].every(
        (a) =>
          (freshOrientation.orientation as Record<string, unknown>)[a] !== null,
      );
    el("orientation-status").textContent = complete
      ? "Ориентация обновляется"
      : "Ожидание ориентации";
    for (const graph of graphs) graph.draw(buffer.samples);
    const analysis = pendulum?.result();
    pendulumGraph.draw(
      pendulum?.processedSignal ?? [],
      pendulum?.periods ?? [],
      pendulum?.crossings ?? [],
    );
    renderStages();
    el("pendulum-quality").textContent =
      !analysis
        ? "Сигнал появится после начала измерения."
        : analysis.periodSec === null
          ? `Недостаточно периодов: ${analysis.completePeriods} из 5.`
          : analysis.quality;
    el("pendulum-period").textContent =
      analysis?.periodSec === null || !analysis
        ? "—"
        : `${analysis.periodSec.toFixed(2)} с`;
    el("pendulum-frequency").textContent =
      analysis?.frequencyHz === null || !analysis
        ? "—"
        : `${analysis.frequencyHz.toFixed(3)} Гц`;
    el("pendulum-count").textContent = String(analysis?.completePeriods ?? 0);
    const gravity =
      measurementLength && analysis?.periodSec !== null && analysis
        ? estimateGravity({
            lengthMeters: measurementLength.lengthMeters,
            periodSeconds: analysis.periodSec,
            ...(measurementLength.uncertaintyMeters === undefined
              ? {}
              : {
                  lengthUncertaintyMeters: measurementLength.uncertaintyMeters,
                }),
            ...(analysis.spreadSec === null || analysis.spreadSec === 0
              ? {}
              : { periodUncertaintySeconds: analysis.spreadSec }),
          })
        : undefined;
    const gravityResult = el("gravity-result");
    if (gravity?.valid) {
      gravityResult.hidden = false;
      el("gravity-summary").textContent =
        `${gravity.gravityMs2.toFixed(2)} м/с²`;
      el("gravity-value").textContent =
        `${state === "MEASURING" ? "Предварительно: " : "Итог: "}${gravity.gravityMs2.toFixed(2)} м/с²`;
      el("gravity-length").textContent =
        `Длина: ${measurementLength!.lengthMeters.toFixed(3)} м`;
      const difference = gravity.differenceMs2,
        signedDifference = `${difference > 0 ? "+" : ""}${difference.toFixed(2)}`;
      el("gravity-reference").textContent =
        `Справочно: ≈${gravity.referenceGravityMs2.toFixed(2)} м/с² · отклонение ${signedDifference} м/с² (${gravity.relativeDifferencePercent.toFixed(1)}%)`;
      el("gravity-calculation").textContent =
        `g = 4π² × ${measurementLength!.lengthMeters.toFixed(3)} / ${analysis!.periodSec!.toFixed(3)}² ≈ ${gravity.gravityMs2.toFixed(2)} м/с²`;
      el("gravity-uncertainty").textContent =
        gravity.uncertaintyMs2 === undefined
          ? ""
          : `Оценка σg: ±${gravity.uncertaintyMs2.toFixed(2)} м/с² (σT — по разбросу периодов)`;
    } else {
      gravityResult.hidden = true;
      el("gravity-summary").textContent = "—";
    }
    el("pendulum-spread").textContent =
      analysis?.spreadSec === null || !analysis
        ? "—"
        : `±${analysis.spreadSec.toFixed(2)} с`;
    el("pendulum-axis").textContent = analysis?.dominantAxis
      ? analysis.dominantAxis.map((x) => x.toFixed(2)).join(" , ")
      : "—";
    el("pendulum-duration").textContent = analysis
      ? `Запись: ${analysis.durationSec.toFixed(1)} с · Частота датчика: ${analysis.sampleRateHz?.toFixed(1) ?? "—"} Гц · PCA-доля главной оси: ${analysis.dominantRatio?.toFixed(2) ?? "—"}`
      : "";
    el("period-list").innerHTML = (pendulum?.periods ?? [])
      .map((p, i) => `<li>T${i + 1}: ${p.seconds.toFixed(2)} с</li>`)
      .join("");
    visualizer?.draw(complete ? freshOrientation : undefined);
  }
  requestAnimationFrame(frame);
  window.addEventListener("beforeunload", (e) => {
    if (recording?.samples.length || experiment.trials.length) {
      e.preventDefault();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && active())
      stop("Страница ноутбука скрыта. Измерение остановлено.");
  });
  if (savedLaptopSession()) button("create").click();
}
