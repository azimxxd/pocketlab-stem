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
E1: initial client foundation implemented. PWA/service worker, curriculum package, API shell and full Investigation/Trial/Analysis revision model remain to be expanded. A GitHub Actions CI workflow is written; remote execution is pending.
E2: first sound flow implemented. It currently uses AnalyserNode, not the target AudioWorklet/STFT worker architecture. Human usability validation is pending.
E3: manual pendulum and model discovery implemented; S2 and M2, gyro/video pendulum modes, broader device validation remain open.
E4–E7: not implemented.

## Next bounded implementation tasks

1. Provision a trusted HTTPS dev URL and complete iPhone/Android permission, cadence and lifecycle matrix; use actual phones.
2. Extend the scenario-specific v2 Investigation/Trial/Analysis pattern to audio and future scenarios; preserve existing v1 audio records.
3. Move reproducible audio analysis to AudioWorklet + Worker; validated STFT normalization and richer quality metrics.
4. Validate the manual pendulum with real apparatus; add S2 bottle resonance and M2 sensor visualization. Then implement sensor/video-based pendulum timing.
5. Add offline asset caching with update-between-experiments behavior and export/import round-trip.
6. Perform video PTS/codec spike, then calibrated manual annotation. Backend/classroom/AI follow stable evidence contracts.

## Known limitations

- RU only; desktop Chromium automated QA does not establish Safari/mobile sensor support.
- No full offline guarantee, no cloud account, no AI, no classroom, no video or gyro-based pendulum timing yet.
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
