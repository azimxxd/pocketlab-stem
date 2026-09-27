# PocketLab Sensor MVP

One phone, one laptop, raw browser motion data, and a simple pendulum gravity estimate. No accounts, simulated readings, database, or server-side recordings.

## Run locally (PowerShell)

Requires Node.js 22.12+ (tested with Node 24) and a WebGL-capable desktop browser.

```powershell
cd 'C:\Users\aldiy\OneDrive\Dokumenter\ChatGPT\PocketLAb'
npm ci
npm run dev
```

Laptop: **http://localhost:3000**. Phone route: `/phone`. The relay shares the same port at `/ws`. Stop the server with Ctrl+C. If the server is already running, do not launch another on the same port.

**A phone cannot use the laptop's localhost address. Plain HTTP over a LAN is not enough for phone sensors.** Use one of the following HTTPS options.

## Fastest real-phone test: temporary HTTPS tunnel

This explicitly exposes only this MVP server through a temporary Cloudflare URL. Sensor traffic passes through that relay; the app itself does not persist it. No Cloudflare account is needed. Keep the URL and session code private during testing and stop the tunnel afterward.

Install cloudflared once:

```powershell
winget install --id Cloudflare.cloudflared --exact --accept-source-agreements --accept-package-agreements
```

Open a new PowerShell so the executable is on PATH. Stop any existing dev server, then run the production build (avoids exposing Vite's development server):

```powershell
cd 'C:\Users\aldiy\OneDrive\Dokumenter\ChatGPT\PocketLAb'
npm run build
npm start
```

In a second PowerShell:

```powershell
cloudflared tunnel --url http://localhost:3000
```

It prints an address like `https://random-words.trycloudflare.com`. Open **that exact printed HTTPS address on the laptop**. Click **Create sensor session**. The QR and phone link will then automatically use the correct public HTTPS host. Scan the QR with the phone. The phone URL is `https://<printed-host>/phone?session=<six-character-code>`. Alternatively open `/phone`, enter the code, and tap **Подключиться**.

The tunnel must keep running alongside `npm start`. A new tunnel may get a different URL. This is a temporary development service, not a deployment or uptime guarantee. If cloudflared already has a config file that prevents quick tunnels, use its documented quick-tunnel setup or the LAN option below.

## LAN-only HTTPS alternative

Use a certificate trusted by **both** laptop and phone; simply bypassing a browser certificate warning is insufficient. The LAN address observed during development was **192.168.8.101**; check the server startup output for the current address.

With [mkcert](https://github.com/FiloSottile/mkcert) installed:

```powershell
mkcert -install
New-Item -ItemType Directory -Force certs
mkcert -cert-file certs/local.pem -key-file certs/local-key.pem localhost 127.0.0.1 192.168.8.101
$env:TLS_CERT = 'certs/local.pem'
$env:TLS_KEY = 'certs/local-key.pem'
npm run dev
```

Replace the IP before creating the certificate if it has changed. Run `mkcert -CAROOT` to locate `rootCA.pem`. Transfer **only that public CA certificate**, never `rootCA-key.pem`, to your phone. On iOS install the downloaded profile in Settings, then enable full trust under General → About → Certificate Trust Settings. On Android install the CA certificate in security/credential settings (names vary). Both devices must be on the same network; allow Node through Windows Firewall on your private network if asked.

Laptop and phone use `https://192.168.8.101:3000` and `https://192.168.8.101:3000/phone` respectively. The laptop can also use trusted `https://localhost:3000`, but then enter `https://192.168.8.101:3000` in its phone-address field and click **Обновить QR**. TLS variables only affect the current terminal; remove them before using the HTTP tunnel setup:

```powershell
Remove-Item Env:TLS_CERT,Env:TLS_KEY -ErrorAction SilentlyContinue
```

## Permissions and first hand-rotation test

1. Open the HTTPS laptop page, create a session, scan the QR on the phone, and tap **Подключиться**. Expect **PHONE CONNECTED** on the laptop.
2. On the phone tap **Разрешить датчики**. On iPhone use Safari and choose **Allow / Разрешить** for the motion/orientation prompt(s). On Android use Chrome and allow motion sensors if prompted; many versions start without a prompt. Permissions are requested only from that button. Use a normal browser tab, not an embedded messenger browser.
3. Check the laptop's availability and observed rate. A device may expose some fields as `null`; orientation requires all three angles for 3D. If access was denied, enable motion access for this site in browser settings, reload the phone page, reconnect, and tap the permission button again. If events never arrive, the phone reports the timeout instead of silently succeeding.
4. Place the phone still on a table. On the laptop click **Начать измерение**.
5. Expect **CALIBRATING**, then after roughly 2.6 seconds **READY**, then **WAITING_FOR_MOTION**, with “Готово. Начните движение”. If calibration fails, keep the phone still and press Start again.
6. Gently pick up and rotate the phone. Sustained movement for at least 80 ms above the calibrated threshold starts **MEASURING** automatically.
7. Expect changing raw numbers, timestamp-based acceleration and angular-rate plots, and a rotating phone-shaped 3D object. Rotate about more than one axis. The white dot marks the physical top; the on-screen arrow responds to portrait/landscape changes.
8. Click **Stop** on the laptop, then **Download raw JSON**. The phone can stop/disconnect too. The JSON must contain real timestamps, original values, calibration, metadata, missing-channel information, and a nonzero sample count.
9. Keep both pages visible and the phone unlocked throughout. A screen wake lock is attempted during calibration/waiting/measurement when available. Hiding either page or losing the stream stops the experiment clearly. Reconnect and start a new measurement after an interruption.

For the pendulum test, enter the length from the pivot to the phone's approximate center of mass, attach the phone securely, calibrate while still, then release it with a small swing and no twist. PocketLab measures the period from the real gyro stream and estimates gravity only after five valid complete periods.

## Architecture and data semantics

```text
Phone /phone → SensorManager → same-origin WebSocket
                              ↓
                 Express + ws session relay
                              ↓
Laptop / → PacketOrder → SensorBuffer → Calibration → MotionStartDetector
                                     → RecordingSession → JSON
                                     → 30 FPS canvas graphs + Three.js
```

- `src/contracts.ts`: shared TypeScript + Zod runtime contract and protocol.
- `src/phone/`: explicit permissions, real event capture, visibility interruptions, wake lock.
- `server/relay.ts`: one phone per random session; laptop reconnect token; no recording storage; heartbeat and backpressure disconnects.
- `src/core.ts`: bounded 15-second display buffer, ordering diagnostics, measured rate, calibration, motion start, independent full recording buffer.
- `src/pendulum.ts` and `src/physics.ts`: sensor-derived period analysis and single-run gravity calculation.
- `src/experiment.ts`: preserved trials, repeat medians, linear fit and CSV rows for multi-length analysis.
- `src/laptop/`: state flow, graphs, numeric/debug display, 3D visualization, experiment plots, dedicated orientation transform.
- `src/socket.ts`: exponential reconnect up to 8 seconds and server round-trip timing.

Every event carries its own `sequence` and acquisition `timestamp` (epoch milliseconds derived from `performance.timeOrigin + event.timeStamp`, with legacy epoch timestamp handling). `source` distinguishes motion and orientation. Motion events carry their raw acceleration/rotation plus the latest orientation **only if less than 1 second old**, with its separate `orientationTimestamp`. Orientation-only packets have null motion fields. Thus no angle is falsely presented as acquired with a motion event. All original orientation events are also transmitted. No missing numeric channel becomes zero.

Observed sensor rate uses actual timestamps of motion events, with orientation-only fallback when no motion stream exists; it does not sum the two event frequencies. It measures event delivery, not the hardware chip's internal sampling clock. Graph x coordinates use acquisition time, not animation frames. Graphs break on missing channels and gaps over 500 ms. Render history is bounded, recording is not downsampled. All valid packets received while measuring are retained, including duplicates/out-of-order arrivals; these do not update live analysis. Lost packets cannot be recovered. Connection diagnostics in the export cover the current connection, not just the recorded interval.

Calibration uses 2.6 seconds of motion data (at least 10 observations on a usable channel). It records per-channel means, population standard deviations, extrema, counts, and measured rate. It rejects obvious acceleration variation, sustained linear acceleration, or gyro movement. It cannot prove perfect stillness (constant-velocity translation is not detectable). Motion start uses bias-relative vector magnitudes greater than six times calibrated noise with floors of 6°/s or 0.65 m/s², sustained for 80 ms. Raw data is never bias-corrected or overwritten. Orientation-only devices can show 3D but cannot perform this accelerometer/gyro calibration flow.

Orientation uses W3C intrinsic Z-X-Y device angles, transformed from the device/world coordinate convention to a Three.js Y-up world in one module. The mesh describes the physical hardware in its natural portrait frame; changing screen orientation rotates the screen-content marker rather than falsely rotating the hardware twice. This assumes a portrait-natural smartphone. Landscape-natural tablets need further validation. Browser headings may be relative, drift, or reset; `absolute` is preserved but is not a claim of compass accuracy. There is no gyro integration fallback and no position reconstruction. Missing angles freeze the model and show a stale/unavailable message.

Recordings live only in the laptop tab's memory. Download before reloading or starting another recording; starting a replacement requires confirmation. Relay sessions survive transient socket reconnects while the server runs, but not server restart or page reload. Recording always stops on disconnect; reconnect never silently fills a gap or resumes a recording. This is a single-process prototype, not an authenticated internet service.

## Automated verification

## Pendulum period measurement

The pendulum analyzer lives in `src/pendulum.ts`, separate from the laptop UI. On each accepted motion sample it subtracts the calibrated α/β/γ gyro bias, incrementally computes the 3D covariance and dominant PCA direction, stabilizes the PCA vector sign, and projects the signed gyro vector onto that axis. It never takes `abs(signal)`. A noise-informed hysteresis band guards zero crossings; periods are measured from positive-to-negative crossing to the next positive-to-negative crossing, with a configurable 0.35–8 s range. The opposite crossing direction is kept for inspection but is not also counted as a cycle. The estimate appears only after five periods and a dominant-axis ratio of at least 0.72. The result uses the median and reports scaled MAD as a robust spread estimate.

The main graph shades each complete same-phase interval and marks both crossings, labelled T1, T2, etc. Beneath it the laptop shows the signed processed signal, status, period, frequency, count, spread, PCA axis, duration and average observed gyro event rate. Raw acceleration and gyro graphs remain below for diagnosis. Chaotic multi-axis motion retains raw and processed data but suppresses the period estimate.

The JSON export retains every raw packet and adds a top-level `pendulum` object with algorithm version, thresholds, gyro bias and noise, dominant axis, timestamped processed signal, all interpolated crossings, individual complete periods and the final result. Values in the raw sensor samples are never changed. Stop remains manual; it freezes both recording and analysis.

Gravity uses the measured median period and entered pendulum length in `g = 4π²L / T²`. Length is entered in centimeters and stored/calculated in meters; empty, non-finite, and sub-centimeter values are rejected. The reference value 9.81 m/s² is shown separately and never changes the measured result. Its difference is labeled as a deviation, not accuracy or measurement error. Optional length uncertainty is left unknown when blank. If it is supplied and the measured period spread is nonzero, first-order propagation reports an estimated σg using that robust period spread as σT; period spread remains visible separately. The pure calculation and validation live in `src/physics.ts`.

For the physical period test:

1. Open the laptop on the HTTPS tunnel address and create a fresh session. Scan its QR on the phone, connect, and allow motion sensors.
2. Mount the phone firmly to the pendulum, keep it still, then press **Начать измерение** on the laptop for calibration.
3. Enter the measured length from the pivot to approximately the phone's center of mass. Optionally enter its measurement uncertainty; leave it blank if unknown.
4. After “Готово. Начните движение,” pull the pendulum aside by roughly 5–10 degrees and release it so it swings freely without twisting.
5. Let it complete about 10–15 swings while watching the processed graph. After at least five valid periods, PocketLab shows a preliminary g from the measured period and length.
6. Press **Остановить**, then **Сохранить измерение** to add this run to the series. The phone session stays connected. Save the whole series as JSON or CSV when ready. No real-phone physical validation is run by the automated test suite.

## Multi-length pendulum experiment

For each run, enter the effective length from the pivot to the approximate center of mass of the mounted phone. Enter length uncertainty only when it was measured. Calibrate with the phone still, release the pendulum at about 5–10° without twisting it, wait for at least five valid full periods, stop, and explicitly save the run. Change the length and repeat; another run at the same length becomes a repeat. No phone reconnection is needed between runs.

The experiment table shows one row per length, with the median period across included repeats. Expand a row to inspect every original trial and explicitly exclude or restore one; trial data and the reason stay in the JSON either way. The T vs L plot shows measured condition medians. The T² vs L plot adds an ordinary least-squares line with a free intercept only after four distinct included lengths. Series gravity is `g = 4π² / a`; the intercept, R², RMSE and per-length residuals remain visible for inspection. The fit never drops an outlier automatically. JSON contains the full raw recording and period analysis once per trial; CSV retains one row per repeat and its inclusion state. The current experiment remains in the laptop tab's memory until exported or the tab is closed.

## Automated verification

```powershell
npm test
npm run build
# With npm run dev or npm start running in another terminal:
npm run test:browser
```

Browser tests use installed Microsoft Edge by default. To use Playwright Chromium instead:

```powershell
npx playwright install chromium
$env:BROWSER_CHANNEL = 'chromium'
npm run test:browser
```

`tests/core.test.ts` covers stationary/moving calibration, noise rejection, motion detection, actual rates, missing values, ordering, full recording vs bounded display history, and orientation axes. `tests/pendulum.test.ts` tests 0.8, 1.0, 1.5 and 2.0 second periods, the mandatory T/2 regression, arbitrary 3D axes, signed projection, noise, gyro bias, decay, timestamp jitter, dropped samples, chaotic rotation and the five-period minimum. `tests/physics.test.ts` covers formula values, invalid inputs, missing uncertainty, and uncertainty propagation. `tests/experiment.test.ts` covers ideal/noisy length series, free intercept, median repeats, outliers, exclusions, invalid trials and minimum distinct lengths. `tests/relay.test.ts` covers routing/isolation, validation, one-phone enforcement, commands, interruptions, and reconnect authorization. `tests/browser.ts` injects synthetic events **only in tests**, exercises the UI end to end including pendulum analysis, single-run gravity, repeat save, CSV/JSON export, exclusions and visible 3D. These artifacts are test evidence, not real-phone data. Real sensor behavior and physical mounting still require the manual test above.

## If something fails, send

- Downloaded raw JSON (before reloading); state whether movement was hand rotation or pendulum.
- Laptop screenshot with connection, state, availability, rate, and **Raw stream debug** expanded; expand **Calibration** for calibration failures.
- Phone screenshot showing permission/connection/state text, plus phone model, OS and browser/version.
- The terminal error from `npm run dev` / `npm start`, plus any browser Console errors. For pairing issues include whether you used tunnel or LAN HTTPS and whether `/health` returns `{"ok":true}` on the phone.
- For wrong 3D axes, describe the initial pose (flat face-up / upright portrait), the axis you rotated, and screen orientation. A short video showing physical phone and laptop together is useful.

The app has no server-side sensor logs; the latest packet and JSON are the raw evidence.

References: [MDN motion/orientation permissions](https://developer.mozilla.org/en-US/docs/Web/API/DeviceOrientationEvent/requestPermission_static), [MDN orientation event axes](https://developer.mozilla.org/en-US/docs/Web/API/Window/deviceorientation_event), [Three.js quaternions](https://threejs.org/docs/pages/Quaternion.html), [Cloudflare quick tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/), [mkcert mobile trust](https://github.com/FiloSottile/mkcert).


## Sound: «Увидь свой голос»

Open `/sound` (also linked from the second navigation tab). The laptop uses
`src/laptop/phone-connection.ts`, extracted from Pendulum: the same connection
card, QR generator, create/resume handshake and `SocketClient`. Both instruments
join through `/phone?session=CODE` and use the existing `/ws` relay. Session
creation accepts an optional `experiment` (`pendulum` by default, or `sound`);
the relay returns that mode on creation, resume and phone join. A QR code carries
only the existing phone URL and session code. No second pairing service exists.

Sound sensor payloads are separately validated in `src/sound/contracts.ts`.
Only the paired phone in a Sound session may send `sound-ready` or `sound-frame`.
Pendulum retains its existing motion sample format and measurement flow.

Microphone access requires a phone button gesture and trusted HTTPS (localhost
works for browser tests). `MicrophoneSource` uses the actual AudioContext sample
rate, Web Audio's Blackman-windowed FFT and a worker-based YIN pitch estimator.
At most 20 compact analysis frames per second are sent, including a short
waveform preview; full audio recordings are never uploaded or saved. The laptop
keeps up to 8 seconds / 180 frames of graph history and aggregate result values.

Connect once from either experiment. The session code and laptop resume token are
kept in local storage, so switching between `/` and `/sound` resumes the same
session automatically. The phone permission action requests both motion sensors
and microphone access; the relay remembers the granted capabilities for the
current session. Switching experiments changes only the active sensor mode. The
phone stays on its existing `/phone` page and keeps the microphone permission
stream ready while measurement is paused; analysis frames are sent only while a
Sound measurement is active.

Start on the laptop, remain quiet for 1.5 seconds, then speak or whistle. Stop
freezes the display and pauses microphone analysis while retaining the phone
connection and permission for the next experiment. Disconnect, hidden phone page,
suspended audio, and input loss interrupt measurement; reconnection uses the
existing transport retry and does not silently resume recording. Saved JSON
contains measurement summaries, not audio.

Validation: `npm test`, `npm run build`, `npm run test:browser` (Pendulum), and
`npm run test:sound-browser` (Sound). Browser scripts use `TEST_URL` when supplied
and otherwise `http://localhost:3000`. Sound browser tests inject synthetic audio
only in the test, covering the actual acquisition/worker/relay/UI path; physical
phone microphone and OS-specific permission behavior still need device QA.
