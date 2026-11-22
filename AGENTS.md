# Repository instructions

- Preserve existing work; inspect `git status` before edits. Do not initialize Git,
  change remotes, commit, push, deploy, or provision services unless explicitly requested.
- Use Angular **21**, NestJS **12**, TypeScript **5.9**, Node **24.x >=24.15**, and
  npm **11** workspaces: `apps/web` and `apps/api`. Keep one root `package-lock.json`.
- Read `docs/PRD.md` (behavior/scope), `docs/SYSTEM_DESIGN.md` (architecture),
  `docs/DATABASE_DESIGN.md` (persistence/invariants), and `docs/API_DESIGN.md`
  (HTTP contracts). Reconcile conflicts explicitly; document age alone is not authority.
- Architecture: modular monolith, Atlas/Mongoose, Zod input validation, application-managed
  server-side sessions, R2 images, Resend email, Google Places discovery, intended Vercel
  single-origin hosting. Do not substitute React/Next.js or external authentication.
- Current scope is only health connectivity. Add business features only when requested.
  No speculative shared packages, generic abstractions, empty future modules, Nx,
  Turborepo, Docker, Redis, or queues in this scaffold.
- Keep API paths under `/api`; Angular uses relative URLs and the development proxy.
  Health must work without credentials. Server secrets never belong in frontend bundles;
  commit only safe `.env.example` files. Preserve the supplied design documents unless
  the task specifically changes them.
- Install: `npm ci`. Run both apps: `npm run dev`; separately: `npm run dev:web`
  and `npm run dev:api`. Use `npm.cmd` on PowerShell when needed.
- Verify: `npm run check` (format, lint, types/templates, tests, builds).
  With servers running: `npm run smoke`. Format scaffold files: `npm run format`.
  Browser verification: `npm run e2e:install`, then `npm run test:e2e` with ports
  8777/4200 free. Playwright starts/stops its own servers; CI runs this test too.
  Run relevant checks after changes and report failures or blocked checks accurately.
