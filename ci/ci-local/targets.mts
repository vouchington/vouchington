import type { CiLocalTarget, CiLocalTargetName } from './types.mts'
import { staticCommands } from './static-commands.mts'
import { workflowCommand } from './workflow-command.mts'

export const targets = {
  static: {
    description:
      'Static code analysis workflow commands that can run locally without GitHub setup actions.',
    commands: [...staticCommands],
  },
  'backend-smoke': {
    description:
      'Backend smoke command from the dedicated backend-smoke workflow, with local .env and port setup.',
    commands: [
      workflowCommand(
        'backend smoke',
        [
          'if [ -f .env ]; then source .env; fi',
          'PORT=$(python3 node_modules/vouchington-tooling/scripts/allocate-browser-safe-ports.py 1)',
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
        "bash -c 'if [ -f .env ]; then source .env; fi; unset CF_WORKER_SECRET; VITEST_CI_REPORTERS=run VITEST_JUNIT_OUTPUT_FILE=web-api-test-report.junit.xml pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web-api'",
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
        "bash -c 'if [ -f .env ]; then source .env; fi; unset CF_WORKER_SECRET; VITEST_CI_REPORTERS=run VITEST_JUNIT_OUTPUT_FILE=web-integration-test-report.junit.xml pnpm exec ./ci/with-node-test-options vitest run --bail=3 --project web-integration'",
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
        'bash -c \'if [ -f .env ]; then set -a; source .env; set +a; fi; export READ_DATABASE_URL="$DATABASE_URL"; pnpm --dir backend run db:clean && cd backend && ENVIRONMENT=staging node data-stores/psql/migrate.mts\'',
        'prepare-postgres.yml',
        'ENVIRONMENT=staging node data-stores/psql/migrate.mts',
      ),
      workflowCommand(
        'postgres schema tests',
        'bash -c \'if [ -f .env ]; then set -a; source .env; set +a; fi; export READ_DATABASE_URL="$DATABASE_URL"; VITEST_CI_REPORTERS=run VITEST_JUNIT_OUTPUT_FILE=postgres-schema-test-report.junit.xml VITEST_MAX_WORKERS=1 pnpm exec ./ci/with-node-test-options vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema --project backend-activitypub-capacity\'',
        'tests-postgres-schema.yml',
        'VITEST_MAX_WORKERS=1 python3 "$GITHUB_WORKSPACE/node_modules/vouchington-tooling/scripts/run-bounded.py" 180 pnpm exec ./ci/with-node-test-options vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema --project backend-activitypub-capacity',
      ),
    ],
  },
} satisfies Record<CiLocalTargetName, CiLocalTarget>
