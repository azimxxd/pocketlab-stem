import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

type Config = { rewrites?: { source: string; destination: string }[]; [key: string]: unknown };
export function configureClassProxy<T extends Config>(config: T, origin: string) {
  const url = new URL(origin);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !/^[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev$/.test(url.hostname)
  )
    throw new Error('Expected the deployed Worker URL: https://worker.account.workers.dev');
  return {
    ...config,
    rewrites: [
      ...(config.rewrites ?? []).filter((r) => r.source !== '/api/class/(.*)'),
      { source: '/api/class/(.*)', destination: `${url.origin}/$1` },
    ],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2] ?? 'vercel.json';
  const config = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(
    file,
    JSON.stringify(configureClassProxy(config, process.env.CLASS_API_ORIGIN ?? ''), null, 2) + '\n',
  );
}
