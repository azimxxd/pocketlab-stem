# PocketLab STEM

A local-first research laboratory. Sound slice: hypothesis → microphone or labelled synthetic signal → spectrum/spectrogram → analysis → personal conclusion → IndexedDB notebook → replay and CSV/JSON export.

Live: **https://pocketlab-stem.vercel.app** (PWA on Vercel). Experiments, recordings, video and the personal notebook stay on the device. When a student submits measurements to a classroom, the room server receives the chosen pseudonym and submitted values; it does not receive audio or video.

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

Every push to `main` deploys automatically: the `deploy` job in `.github/workflows/checks.yml` runs only after build, unit and browser tests pass, then deploys the classroom Worker, configures the same-origin API rewrite from its actual URL, and builds/deploys the Vercel bundle. Cloudflare setup is required; see [classroom deployment](docs/CLASSROOM_DEPLOY.md). Pull requests are checked; the Vercel GitHub app may build a protected preview for other branches, but `vercel.json` (`git.deploymentEnabled.main = false`) stops it from deploying `main`, so production only ever comes from the tested CI job. Repository settings it needs: secret `VERCEL_TOKEN` (a Vercel access token), variables `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (from `.vercel/project.json`).


The project is linked to the Vercel project `pocketlab-stem` (local `.vercel/`, not committed). Vercel builds from source with `npm ci && npm run build`; `vercel.json` sets the CSP, permissions policy and cache headers. `npm run preview` serves the same site headers locally. Phone test procedure: `docs/DEVICE_TESTS.md`.

### Install on a phone (PWA)

`npm run build && npm run preview` serves the production build with a service worker. Once served over HTTPS, the app can be installed: Android Chrome — «Установить приложение»; iPhone Safari — «Поделиться → На экран Домой». After the first online load, local labs, analysis and the notebook work offline. Classroom rooms and live synchronization require an internet connection. New versions are applied only when the user presses «Обновить». The service worker is not active under `npm run dev`.

Browser microphone access requires permission. The synthetic demo is silent: it visualizes a generated sine wave and is explicitly labelled. No audio is saved or sent to a server. The notebook is stored on the current browser only.

## Notebook backup

In «Мой дневник», choose «Подготовить резервную копию», then «Скачать резервную копию». This reads the whole notebook into a dated JSON snapshot. Restore it with «Импорт JSON» in another browser. Imports up to 50 MiB are atomic: a storage failure rolls back all new writes. Identical records with the same ID are skipped; conflicts are retained as copies. Unreadable rows are retained in the backup but skipped with a count during restore. Audio, video and classroom access tokens are not included.

## Research report

Open a saved investigation in the notebook and choose «Печать / PDF». The browser print dialog can save a PDF where supported. The local report includes provenance, hypothesis, conclusion, visible results and expanded method/audit details. Printing does not create a new record revision. Standalone PDF generation with bundled fonts is still planned.

## Structure

- `apps/web`: React/Vite UI, microphone/motion adapters, device-local storage.
- `packages/contracts`: runtime-validated research record schema.
- `packages/media`: MP4/MOV frame-timing reader (no sample data).
- `packages/vision`: template tracker used by the video lab's Web Worker.
- `packages/physics`: spectrum/RMS/tone/quality calculations and the shared model-discovery engine, independent of React.
- `tests`: physics and browser workflow tests.
- `docs/PLAN_SMARTPHONE_LAB.md`: complete v2 product plan.
- `docs/STATUS.md`: completed work, limitations and next steps.

Five local labs cover sound and spectrograms, pendulum timing, bottle resonance, phone motion sensors, and video motion analysis with local tracking. They share a research notebook with model comparisons, measurement uncertainty, reviewable exclusions, versioned analyses and JSON/CSV export. The classroom mode adds teacher/student rooms, assignments, submitted measurements and a live class board. AI guidance, Kazakh content, PDF reports, and a cloud portfolio remain future work. Hardware accuracy and phone-specific behavior still need testing on physical iOS and Android devices.
