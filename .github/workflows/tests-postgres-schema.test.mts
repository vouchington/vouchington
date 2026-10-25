import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-postgres-schema.yml', 'utf8')

describe('PostgreSQL Schema Tests workflow', () => {
  it('provisions both durable stores required by the ActivityPub capacity project', () => {
    expect(workflow).toMatch(
      /image: mirror\.gcr\.io\/pgvector\/pgvector:[\w.-]+@sha256:[0-9a-f]{64}/u,
    )
    expect(workflow).toContain('uses: ./.github/actions/start-valkey')
    expect(workflow).not.toContain('services.valkey')
    expect(workflow).toContain('--project backend-activitypub-capacity')
  })

  it('serializes the destructive ActivityPub capacity project and reaps its process group', () => {
    const tests = workflow.indexOf('      - name: Run PostgreSQL schema tests')
    const snapshot = workflow.indexOf(
      '      - name: Check PostgreSQL schema snapshot is up to date',
    )
    const step = workflow.slice(tests, snapshot)

    expect(tests).toBeGreaterThanOrEqual(0)
    expect(snapshot).toBeGreaterThan(tests)
    expect(step).toContain(
      'VITEST_MAX_WORKERS=1 python3 "$GITHUB_WORKSPACE/node_modules/vouchington-tooling/scripts/run-bounded.py" 180 pnpm exec ./ci/with-node-test-options vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema --project backend-activitypub-capacity',
    )
  })

  it('runs Squawk after setup and before migrations and schema tests', () => {
    const setup = workflow.indexOf('actions/setup-backend')
    const squawk = workflow.indexOf('      - name: Check PostgreSQL SQL safety')
    const migrate = workflow.indexOf('node data-stores/psql/migrate.mts')
    const tests = workflow.indexOf(
      'vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema',
    )

    expect(setup).toBeGreaterThanOrEqual(0)
    expect(squawk).toBeGreaterThan(setup)
    expect(migrate).toBeGreaterThan(squawk)
    expect(tests).toBeGreaterThan(migrate)
    expect(workflow).toContain(
      'pnpm exec squawk backend/data-stores/psql/migrations/*.sql backend/data-stores/psql/config-driven/*.sql backend/data-stores/psql/views/*.sql',
    )
  })

  it('checks the staging RSS seed after one staging migration and before schema tests', () => {
    const migrateStep = workflow.indexOf(
      '      - working-directory: backend\n        env:\n          ENVIRONMENT: staging\n        run: node data-stores/psql/migrate.mts',
    )
    const check = workflow.indexOf('node data-stores/psql/check-staging-rss-bootstrap.mts')
    const schemaTests = workflow.indexOf('      - name: Run PostgreSQL schema tests')

    expect(migrateStep).toBeGreaterThanOrEqual(0)
    expect(check).toBeGreaterThan(migrateStep)
    expect(schemaTests).toBeGreaterThan(check)
    expect(workflow.match(/node data-stores\/psql\/migrate\.mts/gu)).toHaveLength(1)
  })

  it('checks the refreshed platform-stats snapshot before running Vitest', () => {
    const migrateStep = workflow.indexOf('node data-stores/psql/migrate.mts')
    const rssBootstrapCheck = workflow.indexOf(
      'node data-stores/psql/check-staging-rss-bootstrap.mts',
    )
    const platformStatsCheck = workflow.indexOf('node scripts/check-platform-stats-snapshot.mts')
    const schemaTests = workflow.indexOf(
      'vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema',
    )

    expect(migrateStep).toBeGreaterThanOrEqual(0)
    expect(rssBootstrapCheck).toBeGreaterThan(migrateStep)
    expect(platformStatsCheck).toBeGreaterThan(rssBootstrapCheck)
    expect(schemaTests).toBeGreaterThan(platformStatsCheck)
  })

  it('checks the schema snapshot after schema tests, even when Vitest is skipped', () => {
    const tests = workflow.indexOf(
      'vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema',
    )
    const snapshotCheck = workflow.indexOf(
      '      - name: Check PostgreSQL schema snapshot is up to date',
    )
    expect(snapshotCheck).toBeGreaterThan(tests)
    expect(workflow.slice(snapshotCheck)).toContain('if: ${{ !cancelled() }}')
    expect(workflow).toContain('node data-stores/psql/schema-snapshot/generate.mts --check')
  })

  it('runs the bounded native MV owner between bootstrap checks and Vitest on the same database', () => {
    const platformStats = workflow.indexOf('node scripts/check-platform-stats-snapshot.mts')
    const native = workflow.indexOf('      - name: Check native materialized-view contracts')
    const tests = workflow.indexOf('      - name: Clear stale PostgreSQL schema JUnit report')
    const nativeStep = workflow.slice(native, tests)

    expect(native).toBeGreaterThan(platformStats)
    expect(tests).toBeGreaterThan(native)
    expect(nativeStep).toContain(
      'python3 "$GITHUB_WORKSPACE/node_modules/vouchington-tooling/scripts/run-bounded.py" 120 node --experimental-test-module-mocks scripts/check-materialized-view-contracts.mts',
    )
    expect(nativeStep.indexOf('--experimental-test-module-mocks')).toBeGreaterThan(-1)
    expect(nativeStep.indexOf('--experimental-test-module-mocks')).toBeLessThan(
      nativeStep.indexOf('scripts/check-materialized-view-contracts.mts'),
    )
    expect(nativeStep).not.toContain('if:')
    expect(nativeStep).not.toContain('continue-on-error:')
    expect(nativeStep).toContain("NODE_DISABLE_COMPILE_CACHE: '1'")
    expect(nativeStep).toContain('NODE_V8_COVERAGE: ${{ runner.temp }}/native-mv-v8')
    expect(nativeStep).toContain('ANALYTICS_BACKEND: local')
  })

  it('converts the native V8 directory after the unchanged schema snapshot check', () => {
    const snapshot = workflow.indexOf('node data-stores/psql/schema-snapshot/generate.mts --check')
    const conversion = workflow.indexOf('      - name: Convert native materialized-view coverage')
    const publisher = workflow.indexOf('      - name: Preserve full native materialized-view LCOV')
    const conversionStep = workflow.slice(conversion, publisher)

    expect(conversion).toBeGreaterThan(snapshot)
    expect(publisher).toBeGreaterThan(conversion)
    expect(conversionStep).toContain('pnpm exec coverage-check native-v8-to-lcov')
    expect(conversionStep).toContain('--v8-dir "$RUNNER_TEMP/native-mv-v8"')
    expect(conversionStep).toContain('--output "$RUNNER_TEMP/native-mv-coverage/lcov.info"')
    expect(conversionStep).toContain('--source-root "$GITHUB_WORKSPACE"')
    expect(conversionStep).toContain(
      "--include 'backend/{api,data-stores,modules,queues,services,workers}/**/*.mts'",
    )
    expect(conversionStep).toContain("--exclude '**/*.test.mts'")
    expect(workflow).toContain(
      'cp "$RUNNER_TEMP/native-mv-coverage/lcov.info" coverage-full/lcov.info',
    )
  })
})
