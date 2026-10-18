<!-- BEGIN:turborepo-agent-rules -->

# This is NOT the Turborepo you know

Turborepo configuration, task behavior, and CLI commands can vary between installed versions and may differ from your training data. Resolve the `turbo` package from this file's directory or relevant workspace; in monorepos, it may not be visible from the repository root. For example, run `node -p "require.resolve('turbo/package.json')"` from a workspace that depends on `turbo`.

Read `docs/README.md` inside that installed package first, then read the relevant pages from its `docs/` directory before changing Turborepo configuration or commands. Heed deprecation notices. These bundled docs match the installed package version and are available without network access.

This block is written and re-added by `turbo` before repository-scoped commands when an AI agent is detected. In the Turborepo source repository, its template is defined in `crates/turborepo-cli/src/cli/agent_guidance.rs`. Removing the managed block while updates are enabled means a later qualifying invocation will add it again. Set `"agentGuidance": true` in the root `turbo.json` or `turbo.jsonc` to opt in; this does not remove an existing block. Keep the block committed with your work to avoid an uncommitted change on the next agent invocation.
<!-- END:turborepo-agent-rules -->

## Project
- Monorepo (pnpm 11, Node >=24): apps/backend (NestJS + Prisma + better-auth), apps/frontend (Vite + React), packages/eslint-config, packages/typescript-config.
- Commands (via turbo from root): `pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm check-types`, `pnpm test`; `pnpm format` runs Prettier directly. Backend: `pnpm --filter backend prisma:generate`, `pnpm --filter backend prisma:migrate`, `pnpm --filter backend prisma:migrate:deploy`, `pnpm --filter backend db:seed`.
- Specs/plans: `docs/requirements.md`. The FSD and task plan go to `docs/functional-specification.md` and `docs/tasks/plan.md` once written (not yet present).
- Skills live in `.claude/skills/` (shared), `apps/backend/.claude/skills/`, and `apps/frontend/.claude/skills/`.
