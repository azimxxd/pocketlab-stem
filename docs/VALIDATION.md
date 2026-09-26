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
- CI: first remote run failed only on the motion diagnostics test because headless Linux Chromium lacks `DeviceMotionEvent`; the test now supplies a constructor only when absent (events were already synthetic). CI uploads `test-results/` on failure.
- Not established: a real bottle blown near a real phone microphone; plateau thresholds (±3%, 10 frames, 40% voiced) and interpolation bias on real, noisy tones.
