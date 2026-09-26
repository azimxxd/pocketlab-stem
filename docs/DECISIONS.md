# Initial architectural decisions

1. Follow the user-selected local Projects folder and React/Vite plan. No cloud or hosting required for the first slice.
2. Shared Zod schemas validate persisted records. Physics is independent of React/browser APIs; the adapter supplies spectra and time-domain samples.
3. Use AnalyserNode for early integration and visuals. Do not misrepresent this as the final reproducible STFT implementation. Planned AudioWorklet migration is explicit.
4. Source-labelled synthetic sine input exercises the real Web Audio analysis path; zero output gain prevents audible playback. It never substitutes for denied microphone input.
5. Store derived spectrum frames, not PCM. Replaying a graph needs no voice recording.
6. A real-source interruption invalidates aggregate frequency; the partial trace can be retained for explanation. Browser controls release hardware resources.
7. Build a meaningful working application before backend skeletons. Classroom/AI APIs will be created once their evidence schemas are stable.

8. Preserve the existing audio schemaVersion 1. Pendulum gets a scenario-specific schemaVersion 2 with append-only trials, selection events, and saved analysis snapshots. The notebook parses a union without rewriting old records.
9. Model comparison is on the original T scale. Validation holds out whole length conditions, with equal weighting of condition errors. Ordinary least squares uses all included repeats in fitting. g from T²(L) is displayed only when the root model is the comparison winner.
10. Decimal numbers accept comma or point, but do not silently coerce empty, negative, exponential or malformed text. Entered errors are bounds rather than standard uncertainties; interval extrema are propagated directly for an individual trial.
11. Mobile delivery starts as an installable PWA from the same Vite build. The service worker uses prompt-based updates so a version change never interrupts a measurement; it is disabled in dev so tests exercise the network path. Native store packaging (Capacitor) remains an open decision.
12. Leaving unsaved work asks for confirmation through one app-wide guard. Records that fail validation are surfaced and exportable, never silently dropped or deleted.
