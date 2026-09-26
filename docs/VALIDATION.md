# Validation — first implementation, 2026-09-26

## Passed

- `npm run build`: TypeScript check and Vite production build.
- `npm test`: 12 tests for spectral peaks, silence/noise, RMS, power averaging, invalid/short/interrupted captures, simulation provenance, clipping and invalid record schema.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 6 browser tests passed on installed desktop Chrome.
  - Labelled sine simulation through Web Audio → conclusion → IndexedDB → reload → replay → JSON download.
  - Denied microphone permission with actionable fallback.
  - Motion diagnostics with injected synthetic DOM events (not hardware).
  - No horizontal overflow at 360 px on catalogue/sound views.
  - Leaving an active recording closes its AudioContext.
  - Live-source code path using Chrome's fake media device (not hardware).
- Fresh isolated browser pages: no uncaught page errors on catalogue/sound.
- Visual screenshots inspected: desktop 1440 px catalogue; 390 px full sound page. No clipped controls or horizontal overflow observed. The fixed mobile bottom navigation is intentionally visible at viewport bottom.
- `npm install` audit: no vulnerabilities reported for installed package set at install time.

## Not yet established

- Physical iPhone/Android permission, sensor cadence, microphone processing and interruption behavior.
- Acoustic accuracy with a real reference tone; browser tests are not calibration.
- Sensor timestamps and video frame/codec compatibility across physical devices.
- User study, Kazakh copy, full offline mode, automated accessibility audit and 200% text sizing.
- Production hosting and trusted HTTPS endpoint for phones.
- CI workflow is written but not run on a remote repository.

## Browser runner

The Playwright bundled browser download was cancelled when it stalled; tests use the already-installed Chrome through an explicit environment override. Default CI uses Playwright Chromium after `npx playwright install --with-deps chromium`. To reproduce locally with installed Chrome:

```sh
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

## Evidence

Local screenshots in ignored `work/` are QA scratch files. Application records used in tests live in isolated browser contexts and are not mixed into the user's notebook. No microphone permission or real recording from the user's personal browser was required for testing.

## Pendulum iteration

- 15 additional physics/contract tests: SI/period calculation, bounded error extrema, invalid numeric inputs, comma parsing, no g clamping, recovery of root/linear models, ties, insufficient/narrow-range data, group-wise cross-validation, exclusion/restore, mixed provenance rejection, fully excluded series, versioned schema references.
- 4 additional browser tests: five manually entered lengths → root-model comparison → exclude/restore with reason → save → reload → resume and save revision 2; labelled simulated series/JSON provenance; invalid input and 360 px width; hidden-tab timer interruption.
- Desktop and mobile screenshots visually inspected; catalogue links and pendulum model view render without uncaught page errors. A mobile CSS rule hiding the condition-count badge was corrected and rechecked.
- Tests use manually supplied/synthetic values. No claim of hardware timing accuracy or a real pendulum experiment.

Final regression after this iteration: `npm run build` passed, `npm test` passed 27 tests, and `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` passed all 10 browser tests, including the original sound workflows.

## Mobile-readiness iteration

- `npm run build`: TypeScript and production build including `manifest.webmanifest`, `sw.js` (15 precached entries). `npm test`: 27 passed.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 13 passed. New: leave prompt on unsaved series (decline keeps data, accept leaves); saved series exports revision 1 with one analysis on repeated clicks; injected invalid IndexedDB row is reported and downloadable as-is.
- Production preview in desktop Chrome: service worker activated with scope `/`, manifest and all three icons served (200, image/png). After stopping the preview server, reloading `#pendulum` rendered from the service-worker cache. Offline notice appeared once after install and not on later loads.
- Not established: PWA installation and standalone mode on iPhone/Android, Wake Lock and Web Share behavior on phones, whether Safari grants persistent storage. Still requires a trusted HTTPS endpoint.

## S2 bottle and import iteration

- `npm test`: 43 passed. New: Blackman-windowed synthetic sines at 123.4/187.9/440 Hz and Fs 44.1/48 kHz — interpolated peak within 0.1 bin, bin-centre peak within 0.5 bin; steady-tone plateau ignores onset/noise, refuses noise-only, too-short, gliding and interrupted captures; bottle comparison selects f = a/√V on Helmholtz data and linear on linear data; insufficient/narrow-range states; grouped hold-out; mixed-source and tone/provenance rejection; schema references.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 18 passed. New: manual bottle series → inverse-root model → save → notebook → resume revision 2 → CSV/JSON; simulation labelled and export provenance at 360 px; water filling the bottle rejected; microphone tone capture through Chrome's fake device auto-stops after 5 s and closes its AudioContext; JSON import rejects malformed/unknown files without changing the notebook, imports, detects duplicates, and exports byte-identical JSON after round-trip.
- Pendulum refactor onto the shared engine: all previous pendulum unit and browser tests unchanged and passing.
- Desktop screenshot of the simulated bottle series inspected: f = 3958/√V, f²·V ≈ 15 600 Hz²·l, consistent with the generator (≈102 Hz at 1.5 l).
- CI: the first remote runs failed only on the motion diagnostics test. The uploaded page snapshot showed the app's own «Доступ к движению отклонён»: CI's newer Chromium implements `DeviceMotionEvent.requestPermission()` and headless denies it. The test now grants `accelerometer`/`gyroscope` (events remain synthetic), and a separate test covers the denied path. CI uploads `test-results/` on failure.
- Not established: a real bottle blown near a real phone microphone; plateau thresholds (±3%, 10 frames, 40% voiced) and interpolation bias on real, noisy tones.

## M2 iteration

- `npm test`: 54 passed. New (11): measured |a| at rest reported as-is (1.62 m/s² stays 1.62); three still intervals and two movements in the synthetic recording; 90° tilt matches the gyroscope integral (87–93°) about x; 180° spin about the vertical gives <2° tilt but ≈180° gyroscope about y; tilt unchanged under sign-flipped acceleration; rate from timestamps and gap detection; non-increasing timestamps dropped; missing gyroscope/accelerometer kept null; shaking phone has no still interval; short/interrupted flags; schema rejects NaN.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 25 passed. New (6): synthetic recording → movement table → save → notebook → CSV (901 rows); live path with test-dispatched synthetic DeviceMotionEvents reports |a| = 9,7 (not 9,81), labelled «ДАТЧИКИ ТЕЛЕФОНА», ignores events after stop; hidden page interrupts; denied permission; desktop without sensors (Chrome fires an all-null event) reported as no data; 360 px without horizontal overflow.
- Desktop screenshots inspected: charts, still-interval shading, cursor values, movement table («согласуются» / «вокруг вертикали»). Fixed during inspection: «−0» number display, wording that called simulated |a| a phone measurement, timer showing 0 after a synthetic recording.
- Not established: real iPhone/Android event rates, rotationRate units and axis signs per browser, stillness thresholds on real hands/tables, gyroscope drift magnitude.

## E4 video iteration

- `npm test`: 76 passed. New: MP4 timing (7) — constant and variable frame intervals, B-frame ordering with edit-list start, empty-edit delay, remapping edit list flagged, moov after mdat found by header reads only, missing/malformed input. Kinematics (15) — synthetic parabola within 2% without noise (plan acceptance), fitted value follows data (1.62 stays 1.62), camera roll leaves |a| unchanged and appears as direction, real VFR times vs nominal 30 fps, slow-motion factor and unknown speed, scale proportionality/missing/uncertain, fit spread vs scale bound, bounce inside the interval breaks the model, too few points/short interval, labelled demo; bounce h₂/h₁ and e with time stretching, missing contact/points, rebound above drop; record contract (no media for synthetic, metadata for imported).
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 31 passed. New (6), using the generated VP9/MP4 fixture (31 frames, 30/37 ms intervals, known 9.81 m/s² at 200 px = 0.5 m): container timing and «переменный» detected; ruler scale + 11 marks give g within 3% with 0 frame mismatches; JSON keeps container timing, frame times and no blob URL; notebook view; unknown speed withholds g, declared 2× slow motion gives ≈4× acceleration; mark replace/flag/delete and frame stepping by table times; bounce mode asks for contact; synthetic track at 360 px; non-video file rejected.
- Visual check in the browser pane: overlay of scale, marks and trajectory; video pixels read back from the decoded frame confirm the ball at the expected position.
- Not established: real phone clips (iPhone MOV/HEVC with edit lists and rotation, Android MP4, slow motion), Safari seek accuracy and requestVideoFrameCallback behaviour, touch-marking precision on a phone, perspective error for real setups, and the plan's ≈10% g target on a controlled real setup.

## E4 auto-tracking iteration

- `npm test`: 83 passed. New tracker tests (7) on synthetic anti-aliased disks with noise: accelerating ball followed for 12 frames with error < 0.35 px (observed < 0.15 px); brightness/contrast change; disappearance reported as lost with the last position unchanged; look-alike ball within the search window flagged ambiguous; leaving the frame; prediction scaled for a doubled frame interval; flat patch refused.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 32 passed. New: on the VP9/VFR fixture the tracker follows the ball from one tap until it exits at the bottom (stops with «потерян», correlation 0.24, no invented points); every tracked point within 1.5 px of the generated truth; g from tracked points within 3%; a manual correction on frame 5 replaces the automatic mark in `points` while `autoRuns[0]` keeps the raw value.
- Production build: tracker worker emitted as its own chunk and included in the service-worker precache (39 entries).
- Not established: real footage (motion blur, rolling shutter, small or fast balls, cluttered backgrounds, lighting flicker), tracker speed on a weak phone, seek throughput on iPhone Safari with HEVC.

## Deployment — 2026-09-26

- Local production preview with production headers: all five labs exercised (sound demo through Web Audio, bottle and motion demos, video import with container timing, Worker tracker, notebook save) with zero CSP violations and no console errors; service worker activated.
- Vercel production deploy (`pocketlab-stem.vercel.app`): HTTPS 200; CSP, Permissions-Policy, nosniff, no-referrer, COOP present; Vercel adds HSTS. Hashed assets `max-age=31536000, immutable`; sw.js `no-cache`, index `must-revalidate`. Manifest, icons, favicon, tracker worker served with correct types. Entry bundle hash identical to the local build.
- Live smoke test in desktop Chrome: secure context, DeviceMotionEvent and getUserMedia available, M2 synthetic recording analysed, service worker installing with precache, no CSP violations.
- Not established: anything on a phone (see docs/DEVICE_TESTS.md).


## Current project review — 2026-09-26

- `npm run build`: passed after routing classroom production requests through same-origin `/api/class/*`; app CSP remains `connect-src 'self'`.
- `npm test`: 99 passed across 9 files.
- `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`: 36 passed, including classroom teacher/student submission flows.
- Production preview smoke (`npm run preview`, desktop Chrome at `http://localhost:4173/#class`): classroom room creation and API health check succeeded through the local preview proxy, with no console errors or CSP violations.
- Vite config uses Node JSON import attributes to avoid the config-loader deprecation warning.

Live status checked without deploying: `GET https://pocketlab-stem.vercel.app/api/class/health` returned Vercel 404 because production is still on `c427ccb`; the classroom code and rewrite are only in local commit `8059f81` and uncommitted working-tree changes. GitHub currently has only Vercel deploy credentials and no Cloudflare Worker deploy credentials/job. The Worker endpoint could not be resolved from this environment, so its live status is unknown. Physical iPhone and Android tests remain outstanding. No deployment was performed as part of this review.


## Printable report iteration

- Final checks passed: production build, 99 unit tests, 37 browser tests.

- Browser regression covers saved pendulum simulation → print request → expanded method/version details → visible simulation provenance and conclusion → hidden navigation → restored screen view. Reload retains revision 1.
- Print-media screenshot of the pendulum report inspected: hypothesis, model plot, residuals, g formula, measurement table and analysis version are readable. This is a print-layout screenshot, not verification of physical printing or PDF pagination.
- Native PDF destination on iPhone/Android, long reports and printing all other lab scenarios still require validation.

## A5 backup / atomic restore iteration

- Production build passed; 99 unit tests and 40 browser tests passed on desktop Chrome.
- New browser tests: whole-notebook JSON snapshot → fresh browser restore → exact record equality; repeat restore skips identical records; changed conclusion with same ID is kept as a new copy without overwriting the original.
- Injected `QuotaExceededError` on the second IndexedDB write: first new write was rolled back, the pre-existing record remained byte-equivalent in JSON, and retry restored both records successfully. This is fault injection, not a physical disk-full experiment.
- Unreadable raw row inserted directly into IndexedDB appears in the backup even without reloading the list. Restore retains the valid record and reports the skipped invalid row. Notebook with prepared backup fits a 360 px viewport.
- Not established: mobile system share, real storage exhaustion, performance at the 50 MiB import limit, or cross-tab conflict handling for ordinary investigation saves.

## E5 reliability and deployment iteration

- TypeScript/web production build passed. Full suite: 111 unit/API tests and 40 browser tests passed. Existing 30-student shared-screen latency assertion (local p95 < 2 seconds), role isolation, reconnect, retry/idempotency and revocation checks remain passing.
- Added 30 simultaneous student SSE readers, each receiving all 30 submissions with the same final revision and correct personal identity, without teacher-only participant details.
- Fault-injected save and alarm-scheduling failures: no uncommitted participant or revision visible, retry succeeds. Failed deletion preserves the existing room; retry deletes it. Chunked body exceeding 16 KiB without Content-Length is rejected with 413 before room dispatch and the stream is cancelled.
- Proxy configuration tests reject missing/account-less, HTTP, credential-bearing and path/query-bearing URLs, preserve headers, and replace an existing rewrite without duplication.
- Wrangler deploy dry-run succeeded with Durable Object and separate create/join limiter bindings; nothing uploaded. Workflow YAML parsed and deployment order verified locally. GitHub execution with Cloudflare credentials is not yet verified.
- Local Wrangler OAuth authentication succeeds. Read-only account subdomain lookup returned Cloudflare error 10007: workers.dev subdomain not initialized. No account setting, GitHub secret or production deployment was changed during this iteration. Native Worker persistence, remote SSE proxy behavior, live rate limits and real school-network load remain open.
