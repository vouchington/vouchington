import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/tests-postgres-schema.yml', 'utf8')

describe('PostgreSQL Schema Tests workflow', () => {
  it('provisions both durable stores required by the ActivityPub capacity project', () => {
    expect(workflow).toContain('image: pgvector/pgvector:pg18@sha256:')
    expect(workflow).toMatch(/image: valkey\/valkey-bundle:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}/u)
    expect(workflow).toContain(
      "VALKEY_URL=redis://localhost:${{ job.services.valkey.ports['6379'] }}",
    )
    expect(workflow).toContain('--project backend-activitypub-capacity')
  })

  it('serializes the destructive ActivityPub capacity project process-wide', () => {
    expect(workflow).toContain(
      'VITEST_MAX_WORKERS=1 pnpm exec ./ci/with-node-test-options vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema --project backend-activitypub-capacity',
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

  it('checks the schema snapshot after schema tests, even when Vitest is skipped, before index renames and uploads', () => {
    const tests = workflow.indexOf(
      'vitest run --bail=3 --no-file-parallelism --project backend-postgres-schema',
    )
    const snapshotCheck = workflow.indexOf(
      '      - name: Check PostgreSQL schema snapshot is up to date',
    )
    const indexRenames = workflow.indexOf('      - name: Check for renamed PostgreSQL indexes')
    const upload = workflow.indexOf(
      '      - name: Upload postgres-schema vitest blob to GitHub (fallback)',
    )

    expect(snapshotCheck).toBeGreaterThan(tests)
    expect(indexRenames).toBeGreaterThan(snapshotCheck)
    expect(upload).toBeGreaterThan(snapshotCheck)
    expect(workflow.slice(snapshotCheck, indexRenames)).toContain('if: ${{ !cancelled() }}')
    expect(workflow).toContain('node data-stores/psql/schema-snapshot/generate.mts --check')
  })
})
