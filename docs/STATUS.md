# Implementation status — 2026-09-26

## Implemented

- Local repository structure, npm lockfile, TypeScript, React/Vite, shared schemas, pure physics package.
- Home/catalogue with available sound and manual pendulum labs; video is explicitly marked as a future stage.
- Hypothesis recorded before capture; live microphone and independently labelled synthetic sine generator.
- Local FFT visualization through AnalyserNode (4096), 20 Hz visual sampling, 15-second capture limit, effective sample rate and settings metadata.
- Spectrum, time-based spectrogram, dominant spectral component, RMS in dBFS, short/interrupted/no-tone/clipping diagnostics.
- Abortable permission request, stream/context cleanup, interruption when document is hidden.
- Actual motion diagnostics (acceleration and angular velocity checked separately); no simulated hardware results.
- IndexedDB notebook with validated records, persistent hypothesis/conclusion, recorded-timestamp replay, CSV/JSON export, deletion.
- Desktop/mobile layout, keyboard controls, reduced-motion handling, explicit source labels.
- Unit tests, browser workflow tests, production build.

## Stage boundaries

E0: desktop browser capability work started; real iPhone/Android tests and video codec/timebase spike are outstanding. No phone hardware has been tested by the agent.
E1: initial client foundation and installable PWA shell implemented. Curriculum package, API shell and full Investigation/Trial/Analysis revision model remain to be expanded. A GitHub Actions CI workflow is written; remote execution is pending.
E2: first sound flow implemented. It currently uses AnalyserNode, not the target AudioWorklet/STFT worker architecture. Human usability validation is pending.
E3: manual pendulum, S2 bottle resonance series, shared model-discovery engine and JSON import implemented; M2, gyro/video pendulum modes and real-apparatus validation remain open.
E4–E7: not implemented.

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

## Next bounded implementation tasks

1. Provision a trusted HTTPS dev URL and complete iPhone/Android permission, cadence and lifecycle matrix; use actual phones.
2. Extend the scenario-specific v2 Investigation/Trial/Analysis pattern to audio and future scenarios; preserve existing v1 audio records.
3. Move reproducible audio analysis to AudioWorklet + Worker; validated STFT normalization and richer quality metrics.
4. Validate the manual pendulum and S2 bottle with real apparatus and phones (tone plateau thresholds are engineering guesses); add M2 sensor visualization. Then implement sensor/video-based pendulum timing.
5. Offline shell and JSON import are done; add PDF report and global storage quota handling.
7. If store distribution is required: wrap the same build with Capacitor (Android/iOS), replace share/download with Filesystem+Share plugins, add native motion sensor plugin for hardware timestamps. Record the decision in DECISIONS.md first — the plan currently states a native app is not required.
6. Perform video PTS/codec spike, then calibrated manual annotation. Backend/classroom/AI follow stable evidence contracts.

## Known limitations

- RU only; desktop Chromium automated QA does not establish Safari/mobile sensor support.
- PWA install, wake lock, share sheet and storage persistence are verified only on desktop Chrome; iOS Safari standalone behavior is untested on hardware.
- Offline shell only in production builds and only after a first online load; no cloud account, no AI, no classroom, no video or gyro-based pendulum timing yet.
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
