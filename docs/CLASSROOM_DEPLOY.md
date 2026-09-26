# Classroom deployment

The classroom backend is a Cloudflare Worker with one SQLite-backed Durable Object per room. The web app calls `/api/class/*` on its own origin; CSP remains `connect-src 'self'`. No Cloudflare credentials are bundled into the client.

## One-time account setup

1. Open [Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers/workers-and-pages) in the intended Cloudflare account. The account needs its own `workers.dev` subdomain. Workers & Pages was initialized during release setup; the verified account subdomain is `azamatik908.workers.dev`.
2. Create a Cloudflare API token for Workers deployment, scoped to the intended account. Use Cloudflare's Workers token template and the permissions required for the configured Durable Object deployment. Do not copy the personal Wrangler OAuth login into CI or put credentials in this repository.
3. In [GitHub Actions secrets and variables](https://github.com/azimxxd/pocketlab-stem/settings/secrets/actions), set secret `CLOUDFLARE_API_TOKEN` and variable `CLOUDFLARE_ACCOUNT_ID`. Existing Vercel secret/variables are still required. Repository or the `production` environment settings may supply these values.
4. Review and push the prepared changes to `main` when ready to publish. CI intentionally fails before deployment if required settings are missing.

The actual URL is `https://pocketlab-class.<account-subdomain>.workers.dev`, not `https://pocketlab-class.workers.dev`. [Cloudflare routing documentation](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/) and [GitHub Actions deployment documentation](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

## CI sequence

- Check TypeScript and build, bundle the Worker with `wrangler deploy --dry-run`, run unit/API tests and browser tests.
- Only a passing push to `main` enters the serialized production deployment job.
- Deploy the Worker with Wrangler 4.141.0 through the Cloudflare action.
- Take the action's actual deployment URL, validate it, and add the Vercel rewrite using `scripts/configure-class-proxy.ts`. There is deliberately no guessed API destination in committed `vercel.json`.
- Build and deploy Vercel, then check `/api/class/health` for HTTP 200 and body `ok`.

A failed Worker deployment prevents the website deployment. A later web deployment failure does not roll back the already deployed Worker; backend changes must remain compatible with the previous web client. A successful health endpoint alone is not acceptance of Durable Object persistence or real classroom use.

Local `npm run preview` proxies `/api/class` to `npm run api` at port 8787. A Vercel deployment outside this CI path has no classroom rewrite; branch previews are not a validated classroom environment.

## Before declaring E5 production-ready

- Real teacher + student + shared screen: create, join, assign, collect, hide/unhide, revoke, delete.
- 30 real clients on school Wi-Fi; reconnect and offline queued submissions delivered once.
- Check stream flushing through the Vercel proxy; local SSE tests do not establish remote proxy behavior.
- Restart/reload Worker and confirm room persistence; verify automatic closure and seven-day deletion.
- No auth tokens in URLs sent to the API, exports or logs. Participant/observer tokens must not grant teacher commands or access to another room.

Join requests have a separate 300/minute per-client limit because school networks and the reverse proxy may share an address; room capacity remains 30 and the per-room join limit remains 60/minute. Creation retains 30/minute. These are initial operational thresholds and need real traffic validation.
