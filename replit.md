# CareerFlow Riyadh

An application-preparation workspace for students searching for Riyadh-only opportunities.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required services are provisioned through Replit: PostgreSQL, Clerk, App Storage, and Replit AI Integrations.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- Web UI: `artifacts/careerflow-riyadh/src/`
- API routes: `artifacts/api-server/src/routes/careerflow.ts`
- Source adapters: `artifacts/api-server/src/lib/sources.ts`
- Contract: `lib/api-spec/openapi.yaml`
- Schema: `lib/db/src/schema/careerflow.ts`

## Architecture decisions

- Opportunity cards are Riyadh-only; remote listings require explicit Saudi/Riyadh eligibility.
- Demo listings are labeled and never represent active vacancies.
- Ataba and other unconfigured sources are visibly unavailable until an approved feed/API exists.
- Applications are drafts; external submission is always done by the user at the original source.

## Product

Users can maintain a profile and multiple private CVs, discover and save opportunities, prepare AI-assisted drafts, and track applications. Public Greenhouse and Lever feeds can be enabled with verified board identifiers.

## User preferences

- Never fabricate live vacancies, imply demo opportunities are real, scrape restricted sources, send mail, or submit applications automatically.

## Gotchas

- After changing `lib/api-spec/openapi.yaml`, run codegen before consuming hooks or server schemas.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
