# Make My Marriage

Minimal Angular 21 + NestJS 12 TypeScript scaffold using npm workspaces. It contains
a public homepage with fictional wedding previews, a connectivity check at `/health`, and `GET /api/health`; no database or external
service credentials are required. Health reports application liveness, not database readiness.

## Prerequisites and installation

- Node **24.x, at least 24.15**; `.nvmrc` pins the verified version, **24.22.3**.
- npm **11.x** (verified with **11.19.1**).

From the repository root:

```sh
npm ci
```

Use the root `package-lock.json`; do not install independently inside each app.
On Windows PowerShell, use `npm.cmd` in place of `npm` if script execution policy
blocks `npm.ps1`. No global Angular or Nest CLI installation is needed.

## Local development

```sh
npm run dev
```

Open **http://localhost:4200** for the homepage. Account actions currently show a coming-soon notice; the wedding previews do not submit data. The approved Stitch gallery photos are served locally, while fonts load from Google Fonts with system fallbacks. Visit **http://localhost:4200/health** for the connectivity check. Angular calls relative `/api/health`; its development
proxy forwards `/api/**` to **http://127.0.0.1:3000**, preserving the `/api` prefix.
The expected response is `{"data":{"status":"ok"}}`. The page shows loading,
success, or failure and offers a retry; requests time out after five seconds.

To run each application in its own terminal:

```sh
npm run dev:api
npm run dev:web
```

Both commands watch source changes. Stop them with Ctrl+C. No CORS exception is
needed: the browser uses the Angular origin. These are local development servers,
not production deployment commands.

## Configuration and secrets

Defaults work without an `.env` file. For optional server overrides, copy
`apps/api/.env.example` to `apps/api/.env` and restart the API. Only `PORT` (default 3000) and `NODE_ENV` (default development) are currently used; invalid values stop
startup. Existing process environment values take precedence over the file.

If changing the API port, also update `apps/web/proxy.conf.json` and restart Angular.
The API binds to local loopback for this scaffold. Restart this app/terminal if a
new Node installation is not on PATH.

Real `.env` files are ignored at every directory level; examples contain no secrets.
Never put service credentials in Angular source, build configuration, or bundles.
There is no frontend `.env` loader or environment injection. Add provider settings
only when their corresponding feature is implemented.

## Verification

```sh
npm run check
```

This runs formatting checks, ESLint for TypeScript/JavaScript, strict type checking
(including Angular templates), focused tests, and production builds. Individual commands:

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run format` formats scaffold files. The supplied `docs/` designs are deliberately
excluded to preserve their existing formatting. Angular tests use Vitest and mocked
HTTP; API tests use Node's test runner against the compiled Nest application on an
ephemeral port. They need no credentials. HTML/CSS are formatted, and Angular
templates are compiler-checked; no separate template lint plugin is installed.

With both development servers running, verify real HTTP and proxy routing:

```sh
npm run smoke
```

The smoke check verifies direct/proxied health, API JSON 404s, and the Angular document.
For nondefault ports, set `SMOKE_API_ORIGIN` and/or `SMOKE_WEB_ORIGIN` in the shell.
In the browser, stop the API and click **Check again** to confirm the failure state;
restart it and retry to confirm recovery. The smoke script itself is not a browser test.

For a real Chromium test of Angular bootstrap, API connectivity, retry, and API 404 routing:

```sh
npm run e2e:install
npm run test:e2e
```

The first command downloads Playwright's Chromium runtime (repeat after Playwright
upgrades). On Linux, use `npm run e2e:install -- --with-deps` to install required
system libraries as well. Stop your development servers first: the browser test
owns ports 8777 (API) and 4200 (web), starts both apps, and stops its processes afterward.
Its test-specific proxy forwards `/api/**` to port 8777. It
does not reuse existing servers or mock the health request. Browser traces on failure
are written to ignored `test-results/`. `npm run check` stays browser-independent;
run both `npm run check` and `npm run test:e2e` for full verification.

CI runs `npm ci`, the same checks, installs Chromium, and runs the browser test.
Build output is `apps/web/dist/web/browser/` and `apps/api/dist/` (both ignored).
After building, `npm run start --workspace @mmm/api` runs the compiled API locally.

Dependency audit on 15 November 2026 reported 22 moderate advisories in development
tooling (transitive `glob`/`minimatch` dependencies), with no high or critical findings.
The suggested fixes include Angular CLI 22, outside this project's Angular 21 constraint.
Do not run `npm audit fix --force`; revisit compatible upstream patches separately.

## Repository structure and scope

```text
apps/web/       Angular standalone, zoneless application and development proxy
apps/api/       Nest bootstrap, validated server configuration, health module, tests
e2e/            Real Chromium startup and API connectivity test
scripts/        Dependency-free HTTP smoke check
docs/           Approved product, system, database, and API designs
.github/        Verification workflow
AGENTS.md       Short contributor/agent instructions
```

Read [PRD](docs/PRD.md) for behavior/scope, [System Design](docs/SYSTEM_DESIGN.md)
for architecture, [Database Design](docs/DATABASE_DESIGN.md) for persistence, and
[API Design](docs/API_DESIGN.md) for HTTP contracts. Reconcile contradictions explicitly.

The intended product is a modular monolith with Atlas/Mongoose, Zod API validation,
application-managed sessions, R2, Resend, and Google Places. None of those features
or connections is implemented here; Zod currently validates server configuration only.
Do not add empty feature modules, shared packages, authentication, schemas, provider
adapters, or product screens as part of this scaffold.

Vercel remains the intended host. A separate deployment spike must verify combined
Angular static output and Nest execution under one origin, `/api/**` routing before
frontend fallbacks, deep links, missing assets, runtime packaging, and later cookie/CSRF
behavior. There is no deployment configuration or production-readiness claim yet.
