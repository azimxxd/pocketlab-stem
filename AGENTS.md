# PocketLab STEM

Read docs/PLAN_SMARTPHONE_LAB.md before changing scope. The app is a static PWA deployed to Vercel (https://pocketlab-stem.vercel.app); all measurement and analysis stay on the device.

- Preserve the provenance distinction: live, manual, imported, simulation. Never silently replace a sensor with a simulator.
- Keep physics in packages/physics; schemas and units in packages/contracts. SI and seconds at the analysis boundary.
- Never turn missing sensor values into zero, force values to 9.81, or report synthetic tests as hardware validation.
- All microphone/video processing is local unless a future feature explicitly obtains consent.
- Stop listeners, streams, audio contexts and timers on stop, unmount and interruption.
- Keep Russian user-facing copy clear. Future labs are visibly unavailable until implemented.
- Run npm run build, npm test and npm run test:e2e for changes to capture or analysis flows.
- Update docs/STATUS.md and docs/VALIDATION.md with real evidence and unresolved checks.
- Production deploys happen from CI on push to main after all checks pass; do not bypass failing checks with a manual `vercel deploy --prod`. Keep `vercel.json` headers strict (CSP self-only); check `npm run preview`, which serves the same headers, for violations first.
- Do not add cloud services, secrets or accounts to the client. Future backend work (classroom, AI) lives in its own API with its own review.
