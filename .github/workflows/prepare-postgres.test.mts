import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const workflow = readFileSync('.github/workflows/prepare-postgres.yml', 'utf8')
const parsed = load(workflow) as {
  jobs: Record<
    string,
    {
      services?: Record<string, { image?: string }>
      steps?: Array<{
        name?: string
        run?: string
        uses?: string
        env?: Record<string, string>
        with?: Record<string, unknown>
      }>
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
    const safety = steps.findIndex(step => step.name === 'Check PostgreSQL SQL safety')
    const staging = steps.findIndex(step => step.name === 'Check staging RSS fresh bootstrap')
    const dump = steps.findIndex(step => step.name === 'Dump prepared PostgreSQL database')
    const upload = steps.findIndex(step => step.name === 'Upload prepared PostgreSQL database')

    expect(job.services?.postgres?.image).toMatch(
      /^ghcr\.io\/vouchington\/dependency-pgvector:pg18@sha256:/u,
    )
    expect(steps[migrate]?.run).toContain('ENVIRONMENT=staging node data-stores/psql/migrate.mts')
    expect(steps[migrate]?.run).toContain('check-retained-relation-bootstrap.mts')
    expect(safety).toBeGreaterThan(
      steps.findIndex(step => step.uses === './.github/actions/setup-backend'),
    )
    expect(steps[safety]?.run).toContain(
      'pnpm exec squawk backend/data-stores/psql/migrations/*.sql',
    )
    expect(migrate).toBeGreaterThan(safety)
    expect(staging).toBeGreaterThan(migrate)
    expect(steps[staging]?.run).toBe('node data-stores/psql/check-staging-rss-bootstrap.mts')
    expect(steps[staging]?.env?.ENVIRONMENT).toBeUndefined()
    expect(dump).toBeGreaterThan(staging)
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

const consumers = [
  ['tests-postgres-schema.yml', 'postgres-schema-tests', 'test-postgres-schema'],
  ['checks-backend-smoke.yml', 'smoke', 'backend-smoke'],
  ['explain-analyze.yml', 'explain-analyze', 'test-explain-analyze'],
] as const

describe.each(consumers)('%s prepared database consumer', (file, jobId, callerId) => {
  it('restores the current run artifact with a standalone fallback and no baseline migration', () => {
    const source = readFileSync(`.github/workflows/${file}`, 'utf8')
    const consumer = load(source) as {
      on: { workflow_call: { inputs: Record<string, unknown> } }
      jobs: Record<
        string,
        {
          if?: string
          needs?: string[]
          uses?: string
          with?: Record<string, unknown>
          steps?: Array<{
            name?: string
            run?: string
            uses?: string
            with?: Record<string, unknown>
          }>
        }
      >
    }
    expect(consumer.on.workflow_call.inputs.prepared_database).toMatchObject({
      type: 'boolean',
      default: false,
    })
    expect(consumer.jobs['prepare-postgres']).toMatchObject({
      if: '${{ !inputs.prepared_database }}',
      uses: './.github/workflows/prepare-postgres.yml',
    })
    const job = consumer.jobs[jobId]!
    expect(job.needs).toContain('prepare-postgres')
    expect(job.if).toBe('${{ !cancelled() && !failure() }}')
    const download = job.steps?.find(step => step.uses?.startsWith('actions/download-artifact@'))
    expect(download?.with).toMatchObject({
      name: 'backend-postgres-${{ github.run_id }}',
      'github-token': '${{ github.token }}',
      repository: '${{ github.repository }}',
      'run-id': '${{ github.run_id }}',
    })
    const restore = job.steps?.find(step => step.name === 'Restore prepared PostgreSQL database')
    expect(restore?.run).toContain('dependency-pgvector:pg18@sha256:')
    expect(restore?.run).toContain(
      'pg_restore --dbname="$DATABASE_URL" --exit-on-error --no-owner --no-privileges',
    )
    expect(restore?.run).toContain('< "$RUNNER_TEMP/backend-postgres.dump"')
    expect(source).not.toContain('node data-stores/psql/migrate.mts')
    const caller = load(readFileSync('.github/workflows/backend.yml', 'utf8')) as typeof consumer
    expect(caller.jobs[callerId]?.needs).toContain('prepare-postgres')
    expect(caller.jobs[callerId]?.with?.prepared_database).toBe(true)
  })
})
