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
    expect(step).toContain('timeout-minutes: 4')
    expect(step).toContain(
      'VITEST_MAX_WORKERS=1 python3 "$GITHUB_WORKSPACE/ci/run-bounded.py" 180 pnpm exec ./ci/with-node-test-options vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema --project backend-activitypub-capacity',
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
})
