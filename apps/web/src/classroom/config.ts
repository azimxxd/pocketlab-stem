import { createClassApi } from './client';
/** Classroom API origin: VITE_CLASS_API at build time, else the deployed Worker or the local server. */
export const CLASS_API: string =
  import.meta.env.VITE_CLASS_API ??
  (import.meta.env.PROD ? 'https://pocketlab-class.workers.dev' : 'http://127.0.0.1:8787');
export const classApi = createClassApi(CLASS_API);
export const joinUrl = (code: string) => `${location.origin}/#class/join/${code}`;
export const screenUrl = (code: string, viewerToken: string) =>
  `${location.origin}/#class/screen/${code}/${viewerToken}`;
