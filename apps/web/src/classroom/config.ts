import { createClassApi } from './client';
/** Production uses the same-origin Vercel rewrite so the app can keep a self-only connect-src CSP. */
export const CLASS_API: string = import.meta.env.PROD ? '/api/class' : 'http://127.0.0.1:8787';
export const classApi = createClassApi(CLASS_API);
export const joinUrl = (code: string) => `${location.origin}/#class/join/${code}`;
export const screenUrl = (code: string, viewerToken: string) =>
  `${location.origin}/#class/screen/${code}/${viewerToken}`;
