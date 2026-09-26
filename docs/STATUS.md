# Implementation status — 2026-09-26

## Implemented

- Local repository structure, npm lockfile, TypeScript, React/Vite, shared schemas, pure physics package.
- Home/catalogue with five available labs: sound, manual pendulum, bottle resonance, phone motion sensors, and video motion analysis.
- Hypothesis recorded before capture; live microphone and independently labelled synthetic sine generator.
- Local FFT visualization through AnalyserNode (4096), 20 Hz visual sampling, 15-second capture limit, effective sample rate and settings metadata.
- Spectrum, time-based spectrogram, dominant spectral component, RMS in dBFS, short/interrupted/no-tone/clipping diagnostics.
- Abortable permission request, stream/context cleanup, interruption when document is hidden.
- Actual motion diagnostics (acceleration and angular velocity checked separately); no simulated hardware results.
- IndexedDB notebook with validated records, persistent hypothesis/conclusion, recorded-timestamp replay, CSV/JSON export, deletion.
- Desktop/mobile layout, keyboard controls, reduced-motion handling, explicit source labels.
- Unit tests, browser workflow tests, production build.

## Stage boundaries

E0: production HTTPS deployment at https://pocketlab-stem.vercel.app (Vercel, static). Device test procedure in docs/DEVICE_TESTS.md. Real iPhone/Android tests are outstanding; no phone hardware has been tested by the agent.
E1: client foundation, installable PWA shell, validated contracts, local notebook and CI workflow implemented. A structured AI curriculum and cloud portfolio are still open.
E2: first sound flow implemented. It currently uses AnalyserNode, not the target AudioWorklet/STFT worker architecture. Human usability validation is pending.
E3: manual pendulum (M1), S2 bottle resonance series, M2 phone sensors, shared model-discovery engine and JSON import implemented. Gyro/video pendulum modes and real-apparatus/phone validation remain open.
E4: video lab with container timing, manual annotation and local automatic tracking implemented (V1 flight/g, V2 bounce h₂/h₁). Real-clip and on-phone validation remain open.
E5: classroom mode implemented with a Cloudflare Worker API, durable rooms, teacher/student/class-board screens, QR join, assignments, submissions, live updates and offline submission queue. Local API and browser flows pass; production Vercel-to-Worker routing has not yet been verified against the live deployment.
E6–E7: AI guidance, Kazakh localization, PDF report and cloud portfolio remain unimplemented.

## Added in the classroom iteration

- Room API backed by a Cloudflare Durable Object, with validated room operations, capability tokens stored as hashes, role-filtered snapshots, server-sent live updates, and idempotent submissions.
- Teacher flow for creating rooms and assignments; student flow for joining by code/QR and submitting measurements; class screen with live results. A local outbox queues submissions while offline.
- Classroom submissions contain the chosen pseudonym and measurement values; audio and video are not uploaded.
- Local Node API supports development and browser tests. Production uses a same-origin `/api/class/*` rewrite to the Worker so the app can retain its restrictive `connect-src 'self'` policy. The live rewrite still needs a deployment smoke test.

## Added in the mobile-readiness iteration

- Installable PWA: web manifest (standalone, RU, maskable icons), apple-touch-icon and iOS meta tags, safe-area insets for the fixed mobile navigation. Workbox service worker precaches the shell for offline use in production builds only; dev server and browser tests run without it.
- Updates are applied only when the user presses «Обновить» (prompt mode), so a new version never reloads the page during an experiment. A one-time notice confirms offline readiness.
- Leave guard: unsaved pendulum series, a running timer, or an unsaved sound result ask before in-app navigation, browser back/forward and tab close.
- Exporting a saved pendulum series now returns the stored revision; previously every JSON/CSV click produced an extra phantom revision and analysis.
- Notebook no longer hides records that fail schema validation: it reports the count and offers the raw rows as JSON. Nothing is deleted.
- Persistent storage is requested after the first save (`navigator.storage.persist`); the notebook states whether eviction protection is active.
- Screen Wake Lock is held during the pendulum timer and sound recording, so a dimming screen does not hide the page and interrupt the attempt. Unsupported/refused locks do not block measurement.
- JSON/CSV export on touch devices uses the system share sheet (Web Share with files), falling back to a download.
- Spectrogram draws only appended frames with a precomputed palette instead of repainting every cell at 20 Hz.
- `@playwright/test` and `@vitejs/plugin-react` pinned instead of `latest`.

## Added in the S2 / import iteration

- Shared discovery engine (`packages/physics/discovery.ts`): constant, linear, √x and 1/√x models, leave-one-condition-out validation, condition count/range/margin rules per scenario. Pendulum now uses it with unchanged results (`pendulum-v1`).
- Generic UI for series: `ModelDiscovery` (plot, model toggles, scores, residuals) and `TrialAudit` (table, reasoned exclusion, restore, history). Pendulum refactored onto them.
- S2 «Собери музыкальный инструмент»: hypothesis before measurement; bottle capacity fixed per series; air volume = capacity − water (SI m³ internally, ml in UI). Tone source per series: microphone (5 s capture) or entered frequency (e.g. tuner), plus a labelled Helmholtz simulation series. Sources never mix.
- Microphone tone: sub-bin parabolic peak interpolation (opt-in; S1 keeps bin centres), plateau = frames within ±3% of the median, spread = half IQR. Refuses a value for short, noisy, gliding or interrupted captures; flags clipping and tones >4 kHz. Only per-frame peak frequencies are stored, never audio.
- Models f = c, f = aV + b, f = a/√V compared on the f scale; f² = k/V + b shown separately as «f²·V = const» check. Scenario `bottle-01`, schema v2, algorithm `bottle-v1` / `steady-tone-v1`.
- Notebook: bottle records listed, opened, resumed, exported as CSV (SI units) and JSON. JSON import (single record or array, ≤5 MB): schema validation, invalid rows counted and skipped, identical records not duplicated, conflicting IDs imported as a copy instead of overwriting.

## Added in the M2 iteration

- M2 «Что чувствует телефон?»: hypothesis about a phone at rest (0 vs ≈9,8 vs depends) before recording; schematic of device axes; guided «покой → наклон → покой → поворот вокруг вертикали → покой».
- Streaming recorder (`recordMotion`): permission as the first await of the tap (iOS), event timestamps in seconds from the first event, non-increasing events dropped, limits 60 s / 12 000 events, listener always removed; median `event.interval` kept as a diagnostic only. Screen wake lock during recording; hiding the page interrupts it. Events arriving with every field null (desktop Chrome without sensors) are reported as «no data», not analysed.
- Live screen: 10-second rolling charts of a(x, y, z, |a|) and ω(x, y, z), current values and a quasi-static «Покой/Движение» indicator, redrawn at ~12 Hz from a buffer independent of the sensor rate.
- Analysis `motion-v1` (`packages/physics/motion.ts`): rate and gaps from timestamps; still intervals (0.5 s window, per-component SD ≤ 0.12 m/s², |ω| ≤ 4 °/s, ≥ 0.8 s); measured |a| at rest with spread (never a reference g); movements between still intervals comparing gravity tilt (angle between mean gravity vectors — independent of the iOS/Android sign convention) with the trapezoidal gyroscope integral about the dominant axis. Rotation about the vertical is shown as invisible to the accelerometer. Missing channels stay null (`NULL_SENSOR`, `NO_ROTATION_SENSOR`).
- Review with replay cursor, values at cursor, movement table with hedged explanations, quality reasons and method notes; labelled synthetic recording (9 s, 100 Hz). Notebook shows, replays and exports M2 records (CSV with empty cells for missing values, JSON).

## Added in the E4 (video, manual annotation) iteration

- Own ISO BMFF timing reader (`packages/media/mp4-timing.ts`): finds `moov` by reading only box headers (moov before or after mdat, 64-bit sizes), then frame presentation times from stts + ctts (B-frame reordering, signed v1 offsets) + edit list (empty-edit delay, media start/end). Remapping edit lists (e.g. slow-motion segments), fragmented files, missing video tracks and malformed boxes are reported; no nominal fps is ever assumed. No third-party demuxer.
- Import (`accept="video/*"`, which also offers the phone camera): ≤100 MB, ≤30 s, decoded locally, never uploaded or stored. Info card: resolution, duration, frame count, median interval, variable-rate flag, timing source, live frame verification. Non-MP4/MOV or unusable timing ⇒ frames are browsable at nominal steps but acceleration is disabled.
- Frame-accurate stepping: seek to the middle of each frame's presentation interval; where `requestVideoFrameCallback` exists, the presented frame's media time is compared with the container table and any mismatch disables quantitative results.
- Playback speed must be declared (real time / slow motion ×k / unknown). Unknown ⇒ no g.
- Workspace: scale tool (two taps + length and its bound), ball marks per frame with auto-advance (1/2/3/5), «сомнительная» flag, delete, contact frame for bounces; canvas overlay of scale, marks and trajectory; marks in displayed video pixels.
- V1 (`flight-v1`): least-squares parabolas for x(t) and y(t) on real (factor-corrected) times; |a| is roll-invariant and its direction reports camera tilt; fit spread and scale bound shown separately; g only when time, scale, point count/interval and model fit are acceptable. Lack of fit (bounce/contact in interval) disables g.
- V2 (`bounce-v1`): parabola per arc around the marked contact, apex heights above the contact position, h₂/h₁ (scale- and time-unit-independent) and e ≈ √(h₂/h₁) as a labelled model estimate; extrapolated apex and rebound higher than drop flagged.
- Records `video-01` store file metadata, timing source/issues, speed, scale, marks and analysis — never media or blob URLs. Notebook view, CSV (pixels, media time, real time, metres) and JSON.
- Labs are lazy-loaded chunks (initial JS 470 → 351 kB); all chunks remain precached for offline.

## Added in the E4 auto-tracking iteration

- Local tracker (`packages/vision/tracker.ts`, `ncc-v1`): normalised cross-correlation of a square template around the ball, searched near a constant-velocity prediction scaled by the real frame-interval ratio (VFR), parabolic sub-pixel peak, slow template adaptation only on confident matches. The prediction only centres the search and is never output.
- Stops, never interpolates: `LOST` (correlation < 0.5), `OUT_OF_FRAME`, `AMBIGUOUS` (a second peak within 0.05 for three frames running; single ambiguous frames are kept but flagged as uncertain), `END`, `CANCELLED`.
- Runs in a Web Worker on frames downscaled to ≤480 px, taken with the same verified frame seek as manual marking; coordinates are mapped back to video pixels. Progress and cancel in the UI; navigation is locked while running.
- UI: «Трекинг» tool — tap the ball, size the dashed frame, «Отследить с этого кадра». Blue = tracker, green = manual; a manual mark always replaces an automatic one; a new run replaces older automatic marks on its frames. After a loss the user marks that frame and restarts from it.
- Records keep every raw run in `autoRuns` (unmodified by later corrections) and the corrected analysis set in `points`, each with `method` (manual/auto/generated) and tracker `score`. Old records parse with `method = manual`. New analysis notes: `AUTO_POINTS`, `TRACK_LOST` (until the lost frame is marked).

## Next bounded implementation tasks

1. Run docs/DEVICE_TESTS.md on actual iPhone and Android phones against the production URL and record results in VALIDATION.md.
2. Extend the scenario-specific v2 Investigation/Trial/Analysis pattern to audio and future scenarios; preserve existing v1 audio records.
3. Move reproducible audio analysis to AudioWorklet + Worker; validated STFT normalization and richer quality metrics.
4. Validate M1, S2 and M2 with real apparatus and phones (tone plateau and stillness thresholds are engineering guesses; rotationRate units/axes differ across browsers). Then implement gyro/video-based pendulum timing, reusing the M2 recorder.
5. Offline shell and JSON import are done; add PDF report and global storage quota handling.
6. Video: test real iPhone MOV/HEVC and Android MP4 clips (edit lists, rotation, slow motion, seek accuracy on Safari), and tune tracker thresholds on real footage (motion blur, fast throws, busy backgrounds).
7. Add a reviewed Cloudflare Worker deployment path and required credentials, publish the classroom code plus Vercel rewrite through the tested CI path, then test the live API, concurrent rooms, reconnection, and offline queue recovery.
8. Design AI guidance, Kazakh localization, PDF reports and a cloud portfolio around the existing evidence contracts.
9. If store distribution is required: wrap the same build with Capacitor (Android/iOS), replace share/download with Filesystem+Share plugins, add native motion sensor plugin for hardware timestamps. Record the decision in DECISIONS.md first — the plan currently states a native app is not required.

## Known limitations

- RU only; desktop Chromium automated QA does not establish Safari/mobile sensor support.
- PWA install, wake lock, share sheet and storage persistence are verified only on desktop Chrome; iOS Safari standalone behavior is untested on hardware.
- Offline shell only in production builds and after a first online load; classroom rooms and synchronization need internet. No AI mentor or cloud portfolio yet; classroom code is not yet on the deployed production branch, and the prepared Worker CI pipeline still requires Cloudflare account setup and a CI API token. No video or gyro-based pendulum timing yet.
- Audio replay replays saved spectral frames only; raw audio is intentionally not saved.
- Dominant frequency is not a pitch/fundamental detector; the reported value is a median across qualifying frames and may obscure changing tones.
- Quality thresholds are initial engineering values, not experimentally validated measurement accuracy.
- Storage limit is presently enforced per-record (15 s / <1000 frames), not by a global notebook quota. On IndexedDB failure the current result remains exportable.
- CSV is a metric time series; full metadata and spectra are in JSON. Import and PDF are later work.

## Added in the pendulum iteration

- M1 manual timing through a monotonic stopwatch or manually entered seconds; measured conditions locked while timer runs. Backgrounding invalidates the active timer.
- Up to 150 immutable trials; SI input with decimal comma/dot parsing and bounded error estimates. Exact interval extrema for per-trial g from supplied error bounds; no reference-value correction.
- Fit constant, linear and square-root models on the same T scale. Grouped leave-one-length-out validation with all repeats held out together. Minimum five distinct lengths and a 2× span before selecting a winner; near ties remain ambiguous.
- Plot, per-point uncertainty bars, switchable models, residuals, numeric trial table. T²(L) slope estimates g when the root model is preferred; ordinary unweighted fit limitations are visible.
- Every excluded point requires a reason; raw attempts are retained and can be restored. Selection history is visible and exported.
- Explicit synthetic series (5 lengths × 3 repeats) separate from manual observations; provenance exported.
- Scenario-specific v2 record with trials, selection events, versioned analysis snapshots and conclusion per saved revision. Existing v1 audio records remain supported without destructive migration.
- Notebook opens, resumes and exports pendulum series; resaving increments the version of the same investigation.

Still limited: no automatic pendulum sensor acquisition, no physical setup validation, no statistical confidence interval for fitted g, no cross-tab edit conflict resolution. Draft series must be explicitly saved before leaving the lab; records remain local to the current browser.


## Printable notebook reports

- All five saved laboratory views now offer «Печать / PDF», using the browser print dialog. Reports retain hypothesis, conclusion, graphs, result diagnostics, record ID, schema/revision and explicit provenance. Simulation is labelled as educational data.
- Print layout hides navigation and action controls, expands method/audit details, and restores them after printing without saving a new revision. Sound now also displays its aggregate metrics and algorithm/acquisition settings.
- This is browser-based printing, not the full planned standalone PDF exporter with bundled RU/KK fonts. Save-to-PDF availability depends on the browser. Physical mobile printing and all-scenario pagination remain open checks.


## A5 — notebook backup and atomic restore

- Notebook can prepare and download a consistent IndexedDB snapshot as one JSON array, with record count, size and creation time. Preparation is separate from download so mobile sharing is invoked from a direct user gesture. Snapshot includes unreadable raw rows; no cloud account, room tokens, audio or video are included.
- Import accepts single-record exports or backup arrays up to 50 MiB. Export refuses snapshots over the same limit with guidance to export individual investigations. All valid records are restored in one IndexedDB read/write transaction; storage failures abort every write. Existing IDs are compared inside that transaction, preventing two simultaneous imports from racing on the same ID.
- Identical records with the same ID are skipped, conflicting records receive a new ID, invalid rows are counted and skipped. Raw unreadable rows remain in the backup file even though this app cannot restore them. No pre-existing notebook rows are deleted.
- Remaining A5 work: global storage/quota UI, cross-tab revision conflict handling for normal saves, standalone PDF generation, and optional portfolio sync. Mobile share and actual disk-full behavior still need device checks.


## E5 reliability and deployment preparation

- Added tests with 30 simultaneous student SSE connections receiving all 30 submissions at a common revision. Existing tests cover room/role isolation, reconnect, idempotency and revocation. All are local Node-hosted tests, not Cloudflare load acceptance.
- API checks actual streamed request bytes against 16 KiB even without Content-Length. Failed writes invalidate cached mutable state so subsequent requests read the last persisted room; failed deletion no longer discards a live room. SSE registration shares the room request queue and heartbeat timers stop when the final stream closes.
- CI now bundles the Worker during checks, requires Cloudflare credentials before production deploy, deploys the Worker before Vercel, derives the same-origin proxy destination from its real URL and checks deployed health. Join limits are separate from creation limits to allow school/proxy shared-IP retries.
- Wrangler authentication works locally, but Cloudflare returned code 10007 for the account: Workers & Pages must initialize a workers.dev subdomain. No deployment performed. See CLASSROOM_DEPLOY.md for the remaining setup and live acceptance checks.
