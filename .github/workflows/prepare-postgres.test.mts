import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/prepare-postgres.yml', 'utf8')
const parsed = load(workflow) as {
  jobs: Record<
    string,
    {
      services?: Record<string, { image?: string }>
      steps?: Array<{ name?: string; run?: string; uses?: string; with?: Record<string, unknown> }>
    }
  >
}

describe('prepared backend PostgreSQL workflow', () => {
  it('migrates and verifies once before publishing a custom-format dump', () => {
    const job = parsed.jobs['prepare-postgres']!
    const steps = job.steps ?? []
    const migrate = steps.findIndex(
      step => step.name === 'Migrate and verify backend test database',
    )
    const dump = steps.findIndex(step => step.name === 'Dump prepared PostgreSQL database')
    const upload = steps.findIndex(step => step.name === 'Upload prepared PostgreSQL database')

    expect(job.services?.postgres?.image).toMatch(
      /^ghcr\.io\/vouchington\/dependency-pgvector:pg18@sha256:/u,
    )
    expect(steps[migrate]?.run).toContain('node data-stores/psql/migrate.mts')
    expect(steps[migrate]?.run).toContain('check-retained-relation-bootstrap.mts')
    expect(dump).toBeGreaterThan(migrate)
    expect(steps[dump]?.run).toContain('pg_dump --format=custom --no-owner --no-privileges')
    expect(upload).toBeGreaterThan(dump)
    expect(steps[upload]?.with).toMatchObject({
      name: 'backend-postgres-${{ github.run_id }}',
      'retention-days': 1,
      overwrite: true,
      'if-no-files-found': 'error',
    })
  })

  it('uses the PG18 dependency image as the pg_dump client', () => {
    const dump = parsed.jobs['prepare-postgres']?.steps?.find(
      step => step.name === 'Dump prepared PostgreSQL database',
    )

    expect(dump?.run).toContain('docker run --rm --network host')
    expect(dump?.run).toContain('dependency-pgvector:pg18@sha256:')
  })
})
