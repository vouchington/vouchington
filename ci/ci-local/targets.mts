import type { CiLocalTarget, CiLocalTargetName } from './types.mts'
import { WEB_TYPECHECK_ENV, workflowCommand } from './workflow-command.mts'

export const targets = {
  static: {
    description:
      'Static code analysis workflow commands that can run locally without GitHub setup actions.',
    commands: [
      workflowCommand(
        'oxlint',
        'pnpm exec oxlint --type-aware --deny-warnings',
        'static-code-analysis.yml',
      ),
      workflowCommand('jscpd', 'pnpm exec jscpd .', 'static-code-analysis.yml'),
      workflowCommand(
        'syncpack',
        'pnpm exec syncpack lint && pnpm exec syncpack format --check',
        'static-code-analysis.yml',
        'pnpm exec syncpack lint',
      ),
      workflowCommand(
        'no-mistakes',
        'pnpm run no-mistakes',
        'static-code-analysis.yml',
        'pnpm exec no-mistakes --timeout 0 --lock-timeout 0 check --tsconfig tsconfig.json',
      ),
      workflowCommand(
        'squawk',
        'pnpm exec squawk backend/data-stores/psql/migrations/*.sql backend/data-stores/psql/config-driven/*.sql backend/data-stores/psql/views/*.sql',
        'tests-postgres-schema.yml',
      ),
      workflowCommand(
        'backend dependency-cruiser',
        'pnpm exec depcruise --config backend/.dependency-cruiser.cjs --output-type err backend ts-shared',
        'checks-static.yml',
        'pnpm exec depcruise --config backend/.dependency-cruiser.cjs --output-type err',
      ),
      workflowCommand(
        'web dependency-cruiser',
        'pnpm exec depcruise --config web/.dependency-cruiser.cjs --output-type err web',
        'checks-static.yml',
        'pnpm exec depcruise --config web/.dependency-cruiser.cjs --output-type err',
      ),
      workflowCommand(
        'lambda dependency-cruiser',
        'pnpm exec depcruise --config lambdas/.dependency-cruiser.cjs --output-type err lambdas',
        'checks-static.yml',
        'pnpm exec depcruise --config lambdas/.dependency-cruiser.cjs --output-type err',
      ),
      workflowCommand(
        'tooling dependency-cruiser',
        'node static-code-analysis/run-tooling-dependency-cruiser.mts',
        'static-code-analysis.yml',
        'node static-code-analysis/run-tooling-dependency-cruiser.mts',
      ),
      workflowCommand(
        'Playwright dependency-cruiser',
        "pnpm exec depcruise --config .dependency-cruiser.cjs --output-type err --do-not-follow '^(?!playwright/tests/)' playwright/tests",
        'static-code-analysis.yml',
        '--do-not-follow "^(?!playwright/tests/)" playwright/tests',
      ),
      workflowCommand(
        'scripts typecheck',
        'pnpm exec tsc --noEmit --project tsconfig.json',
        'static-code-analysis.yml',
      ),
      workflowCommand(
        'ts-shared typecheck',
        'pnpm exec tsc --noEmit --project ts-shared/tsconfig.json',
        'static-code-analysis.yml',
      ),
      workflowCommand(
        'playwright typecheck',
        'pnpm exec tsc --noEmit --project playwright/tsconfig.json',
        'static-code-analysis.yml',
      ),
      workflowCommand(
        'test-helpers typecheck',
        'pnpm exec tsc --noEmit --project test-helpers/tsconfig.json',
        'static-code-analysis.yml',
      ),
      workflowCommand(
        'integration-tests typecheck',
        'pnpm exec tsc --noEmit --project integration-tests/tsconfig.json',
        'static-code-analysis.yml',
      ),
      workflowCommand(
        'knip',
        'pnpm exec knip --treat-config-hints-as-errors',
        'static-code-analysis.yml',
      ),
      workflowCommand('oxfmt', 'pnpm exec oxfmt --check', 'static-code-analysis.yml'),
      workflowCommand('selene', 'pnpm run selene', 'static-code-analysis.yml'),
      workflowCommand(
        'backend typecheck',
        'pnpm exec tsc --noEmit --incremental --project backend/tsconfig.json && pnpm exec tsc --noEmit --project email-templates/tsconfig.json',
        'checks-static.yml',
        'pnpm exec tsc --noEmit --incremental --project backend/tsconfig.json && pnpm exec tsc --noEmit --project email-templates/tsconfig.json',
      ),
      {
        ...workflowCommand(
          'web typecheck',
          'cd web && pnpm exec next typegen && pnpm exec tsc --noEmit --incremental',
          'checks-static.yml',
          'pnpm exec next typegen && pnpm exec tsc --noEmit --incremental',
        ),
        env: WEB_TYPECHECK_ENV,
      },
      workflowCommand(
        'cloudflare-worker typecheck',
        'pnpm exec tsc --noEmit --project cloudflare-worker/tsconfig.json',
        'checks-static.yml',
      ),
      workflowCommand(
        'lambdas typecheck',
        'pnpm exec tsc --noEmit --project lambdas/tsconfig.json',
        'checks-static.yml',
      ),
    ],
  },
  'backend-smoke': {
    description:
      'Backend smoke command from the dedicated backend-smoke workflow, with local .env and port setup.',
    commands: [
      workflowCommand(
        'backend smoke',
        [
          'if [ -f .env ]; then source .env; fi',
          'PORT=$(python3 ci/allocate-browser-safe-ports.py 1)',
          'export PORT',
          'cd backend',
          './scripts/tests/smoke-test-server.sh && ./scripts/tests/smoke-test-worker.sh',
        ].join(' && '),
        'checks-backend-smoke.yml',
        './scripts/tests/smoke-test-server.sh && ./scripts/tests/smoke-test-worker.sh',
      ),
    ],
  },
  'web-api': {
    description: 'Web API test workflow commands with a local database migration and no web build.',
    commands: [
      workflowCommand(
        'migrate web API database',
        "bash -c 'if [ -f .env ]; then set -a; source .env; set +a; fi; cd backend && node data-stores/psql/migrate.mts'",
        'tests-web-api.yml',
        'node data-stores/psql/migrate.mts',
      ),
      workflowCommand(
        'web API tests',
        "bash -c 'if [ -f .env ]; then source .env; fi; unset CF_WORKER_SECRET; VITEST_CI_REPORTERS=run VITEST_JUNIT_OUTPUT_FILE=web-api-test-report.junit.xml VITEST_BLOB_OUTPUT_FILE=.vitest-reports/web-api.json pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web-api'",
        'tests-web-api.yml',
        'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web-api',
      ),
    ],
  },
  'web-integration': {
    description:
      'Full-stack web integration build and test workflow commands, preserving local DB/Valkey URLs but unsetting CF_WORKER_SECRET for the test step.',
    commands: [
      workflowCommand(
        'build web integration targets',
        "bash -c 'if [ -f .env ]; then set -a; source .env; set +a; fi; node ci/setup-web-integration.mts'",
        'tests-web-integration.yml',
        'uses: ./.github/actions/build-web-targets',
      ),
      workflowCommand(
        'web integration tests',
        "bash -c 'if [ -f .env ]; then source .env; fi; unset CF_WORKER_SECRET; VITEST_CI_REPORTERS=run VITEST_JUNIT_OUTPUT_FILE=web-integration-test-report.junit.xml VITEST_BLOB_OUTPUT_FILE=.vitest-reports/web-integration.json pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web-integration'",
        'tests-web-integration.yml',
        'pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web-integration',
      ),
    ],
  },
  'postgres-schema': {
    description: 'PostgreSQL schema workflow commands that rebuild and test the local database.',
    commands: [
      workflowCommand(
        'clean database and run migrations',
        'bash -c \'if [ -f .env ]; then set -a; source .env; set +a; fi; export READ_DATABASE_URL="$DATABASE_URL"; pnpm --dir backend run db:clean && cd backend && node data-stores/psql/migrate.mts\'',
        'tests-postgres-schema.yml',
        'node data-stores/psql/migrate.mts',
      ),
      workflowCommand(
        'postgres schema tests',
        'bash -c \'if [ -f .env ]; then set -a; source .env; set +a; fi; export READ_DATABASE_URL="$DATABASE_URL"; VITEST_CI_REPORTERS=run VITEST_JUNIT_OUTPUT_FILE=postgres-schema-test-report.junit.xml VITEST_BLOB_OUTPUT_FILE=.vitest-reports/postgres-schema.json VITEST_MAX_WORKERS=1 pnpm exec ./ci/with-node-test-options vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema --project backend-activitypub-capacity\'',
        'tests-postgres-schema.yml',
        'VITEST_MAX_WORKERS=1 pnpm exec ./ci/with-node-test-options vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema --project backend-activitypub-capacity',
      ),
    ],
  },
} satisfies Record<CiLocalTargetName, CiLocalTarget>
