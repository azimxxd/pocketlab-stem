# PocketLab STEM

Read docs/PLAN_SMARTPHONE_LAB.md before changing scope. The current stage is a local web implementation, not a deployed Sites project.

- Preserve the provenance distinction: live, manual, imported, simulation. Never silently replace a sensor with a simulator.
- Keep physics in packages/physics; schemas and units in packages/contracts. SI and seconds at the analysis boundary.
- Never turn missing sensor values into zero, force values to 9.81, or report synthetic tests as hardware validation.
- All microphone/video processing is local unless a future feature explicitly obtains consent.
- Stop listeners, streams, audio contexts and timers on stop, unmount and interruption.
- Keep Russian user-facing copy clear. Future labs are visibly unavailable until implemented.
- Run npm run build, npm test and npm run test:e2e for changes to capture or analysis flows.
- Update docs/STATUS.md and docs/VALIDATION.md with real evidence and unresolved checks.
- Do not add cloud dependencies, secrets, deployment or accounts merely to run the local stage.
