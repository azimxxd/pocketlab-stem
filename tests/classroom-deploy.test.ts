import { it, expect } from 'vitest';
import { configureClassProxy } from '../scripts/configure-class-proxy';
it('uses the deployed account-specific Worker URL and preserves security headers', () => {
  const config = {
    headers: [
      {
        source: '/(.*)',
        headers: [{ key: 'Content-Security-Policy', value: "connect-src 'self'" }],
      },
    ],
  };
  const result = configureClassProxy(config, 'https://pocketlab-class.example.workers.dev');
  expect(result.headers).toEqual(config.headers);
  expect(result.rewrites).toEqual([
    { source: '/api/class/(.*)', destination: 'https://pocketlab-class.example.workers.dev/$1' },
  ]);
  expect(
    configureClassProxy(result, 'https://pocketlab-class.other.workers.dev').rewrites,
  ).toHaveLength(1);
});
it.each([
  '',
  'https://pocketlab-class.workers.dev',
  'http://pocketlab-class.example.workers.dev',
  'https://pocketlab-class.example.workers.dev/path',
  'https://user:password@pocketlab-class.example.workers.dev',
  'https://pocketlab-class.example.workers.dev?token=x',
])('rejects invalid deployment URL %s', (origin) => {
  expect(() => configureClassProxy({}, origin)).toThrow();
});
