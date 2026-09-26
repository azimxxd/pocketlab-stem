# PocketLab STEM

A local-first research laboratory. Sound slice: hypothesis → microphone or labelled synthetic signal → spectrum/spectrogram → analysis → personal conclusion → IndexedDB notebook → replay and CSV/JSON export.

Live: **https://pocketlab-stem.vercel.app** (static PWA on Vercel; nothing is uploaded — recordings, video and the notebook stay on the device).

## Run

Requires Node.js 22.12+ (developed on Node 24) and npm.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Localhost is a secure context for browser capture. A phone on a plain HTTP LAN address is **not** — test phones against the HTTPS deployment.

```sh
npm run build
npm test
npx playwright install chromium
npm run test:e2e
# Or use an already-installed Chrome:
PLAYWRIGHT_CHANNEL=chrome npm run test:e2e
```

### Deploy

Every push to `main` deploys automatically: the `deploy` job in `.github/workflows/checks.yml` runs only after build, unit and browser tests pass, then `vercel pull → build → deploy --prebuilt --prod`. Pull requests are checked; the Vercel GitHub app may build a protected preview for other branches, but `vercel.json` (`git.deploymentEnabled.main = false`) stops it from deploying `main`, so production only ever comes from the tested CI job. Repository settings it needs: secret `VERCEL_TOKEN` (a Vercel access token), variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (from `.vercel/project.json`).

Manual deploy from a linked checkout, if ever needed:

```sh
npx vercel@60 deploy --prod
```

The project is linked to the Vercel project `pocketlab-stem` (local `.vercel/`, not committed). Vercel builds from source with `npm ci && npm run build`; `vercel.json` sets the CSP, permissions policy and cache headers. `npm run preview` serves the same site headers locally. Phone test procedure: `docs/DEVICE_TESTS.md`.

### Install on a phone (PWA)

`npm run build && npm run preview` serves the production build with a service worker. Once served over HTTPS, the app can be installed: Android Chrome — «Установить приложение»; iPhone Safari — «Поделиться → На экран Домой». After the first load, labs, analysis and the notebook work offline. New versions are applied only when the user presses «Обновить». The service worker is not active under `npm run dev`.

Browser microphone access requires permission. The synthetic demo is silent: it visualizes a generated sine wave and is explicitly labelled. No audio is saved or sent to a server. The notebook is stored on the current browser only.

## Structure

- `apps/web`: React/Vite UI, microphone/motion adapters, device-local storage.
- `packages/contracts`: runtime-validated research record schema.
- `packages/media`: MP4/MOV frame-timing reader (no sample data).
- `packages/vision`: template tracker used by the video lab's Web Worker.
- `packages/physics`: spectrum/RMS/tone/quality calculations and the shared model-discovery engine, independent of React.
- `tests`: physics and browser workflow tests.
- `docs/PLAN_SMARTPHONE_LAB.md`: complete v2 product plan.
- `docs/STATUS.md`: completed work, limitations and next steps.

This is the first implementation, not the complete planned platform. M2 records phone accelerometer/gyroscope streams and compares gravity tilt with the integrated gyroscope. Manual pendulum and the S2 bottle-resonance series include measurement series, error bounds, model comparison, exclusion history and saved analysis revisions; the notebook imports and exports JSON. The video lab reads frame times from MP4/MOV and supports manual annotation and local automatic tracking with explicit loss (g from a throw, bounce height ratio). Gyro/video pendulum timing, AI, classroom, Kazakh content, PDF report and server synchronization remain future stages. No active UI controls claim these features are working.
