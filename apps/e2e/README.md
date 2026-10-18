# e2e

Playwright end-to-end tests for the AI Design Brief Assistant. They run on demand against the whole stack (browser, nginx, NestJS, Postgres, AI provider) and are not part of root `pnpm test`.

## Run

```bash
# 1. Start the stack
docker compose up --build -d

# 2. One-time browser install
pnpm --filter e2e install:browsers

# 3. Run (turbo builds @lmesh/api-contract first)
pnpm test:e2e
```

`E2E_BASE_URL` overrides the base URL (default `http://localhost:5173`). `global-setup.ts` waits up to 60 s for `/api/v1/health` through that origin.

## Failure-path tests need the e2e compose override

`tests/ai-failures.spec.ts` relies on the fault markers (`[[e2e-fault:timeout]]`, `error-midstream`, `malformed`, `slow`), which the backend only honours when `AI_FAULT_INJECTION=true`. Only `docker-compose.e2e.yml` sets it; never enable it in the default compose file.

```bash
docker compose -f docker-compose.yml -f docker-compose.e2e.yml up --build -d
```

All other messages go to the real configured AI provider, so journeys assert behaviour (streaming grows, status, persistence), never wording.

## Notes

- A `setup` project signs in once as the seed user and saves `.auth/user.json`; specs reuse it.
- Sign-in is rate limited (5 per 60 s per IP). A run signs in 3 times (setup, auth journey, wrong password), and those tests do not retry. If a run fails with "Too many sign-in attempts", wait 60 s.
- Each test creates its own uniquely named project and deletes it afterwards; the seed projects are never touched.
- Traces and screenshots are kept on failure in `test-results/`; the HTML report is in `playwright-report/`.
