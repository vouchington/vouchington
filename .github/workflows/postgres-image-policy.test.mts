import { parse as load } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { maxCiVitestWorkers } from '../../test-helpers/vitest-config/environment.mts'
import {
  postgresWorkflowPolicyViolations,
  type OpsWorkflow,
} from '../../ci/workflow-ops-policy.mts'

const ciPostgresMaxConnections = 300
// Tests trigger ERRORs on purpose, and every ERROR already reaches the client that caused it, so
// the server-log copy (plus its STATEMENT line) only floods the service-container log. LOG ranks
// above ERROR in log_min_messages, so startup, checkpoint, and crash lines still print.
const ciPostgresLogMinMessages = 'log'
const requiredInitdbArgs = `-c max_connections=${ciPostgresMaxConnections} -c log_min_messages=${ciPostgresLogMinMessages}`
const requiredDockerInitdbArgs = `POSTGRES_INITDB_ARGS="${requiredInitdbArgs}"`

type VitestConfig = {
  test?: {
    maxWorkers?: number | string
  }
}

const validPgvectorImage = `ghcr.io/vouchington/dependency-pgvector:synthetic-tag@sha256:${'a'.repeat(64)}`
const postgresPolicySources: Record<string, string> = {
  '.github/workflows/unit.yml': `
jobs:
  test:
    services:
      postgres:
        image: ${validPgvectorImage}
        env:
          POSTGRES_INITDB_ARGS: '-c max_connections=300 -c log_min_messages=log'
`,
  '.github/workflows/explain-analyze.yml': `
jobs:
  analyze:
    services:
      postgres:
        env:
          POSTGRES_INITDB_ARGS: '-c max_connections=300 -c log_min_messages=log -c work_mem=32MB'
`,
  '.github/workflows/initialize-smoke-test.yml': `
jobs:
  smoke:
    steps:
      - run: source .github/workflows/initialize-smoke-test/prepare-postgres.sh
`,
  '.github/workflows/initialize-smoke-test/prepare-postgres.sh': `
docker run -e ${requiredDockerInitdbArgs} ${validPgvectorImage}
`,
}
const postgresPolicyDocuments = Object.fromEntries(
  Object.entries(postgresPolicySources)
    .filter(([path]) => path.endsWith('.yml'))
    .map(([path, source]) => [path, load(source) as OpsWorkflow]),
)

function postgresPolicyErrors(sources: Record<string, string>) {
  const documents = Object.fromEntries(
    Object.entries(sources)
      .filter(([path]) => path.endsWith('.yml'))
      .map(([path, source]) => [path, load(source) as OpsWorkflow]),
  )
  return postgresWorkflowPolicyViolations(sources, documents)
}

describe('PostgreSQL workflow image policy', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps every pgvector image reference on one immutable digest', () => {
    expect(
      postgresWorkflowPolicyViolations(postgresPolicySources, postgresPolicyDocuments),
    ).toEqual([])
    expect(
      postgresPolicyErrors({
        ...postgresPolicySources,
        '.github/workflows/unit.yml': postgresPolicySources['.github/workflows/unit.yml'].replace(
          validPgvectorImage,
          'ghcr.io/vouchington/dependency-pgvector:synthetic-tag',
        ),
      }),
    ).toEqual([
      'Postgres workflow image is not digest pinned: ghcr.io/vouchington/dependency-pgvector:synthetic-tag',
      'Postgres workflow images must use one digest-pinned reference; found 2',
    ])
  })

  it('sizes CI postgres above the default Vitest fork connection budget', () => {
    const vitestMaxWorkers = maxCiVitestWorkers
    const testPoolMax = 20
    const advisoryLockMax = 4
    const globalSetupProcess = 1
    const superuserReservedConnections = 3
    const worstCaseBudget =
      (vitestMaxWorkers + globalSetupProcess) *
        (testPoolMax + testPoolMax + advisoryLockMax + advisoryLockMax) +
      superuserReservedConnections

    expect(ciPostgresMaxConnections).toBeGreaterThanOrEqual(worstCaseBudget)
  })

  it('caps effective CI Vitest worker overrides at the postgres-compatible maximum', async () => {
    vi.stubEnv('CI', 'true')

    expect(maxCiVitestWorkers).toBe(5)
    for (const [configuredWorkers, expectedWorkers] of [
      ['', 2],
      ['5', 5],
      ['6', maxCiVitestWorkers],
      ['100%', 2],
    ] as const) {
      vi.stubEnv('VITEST_MAX_WORKERS', configuredWorkers)
      vi.resetModules()
      const { default: config } = (await import('../../vitest.config.mts')) as {
        default: VitestConfig
      }

      expect(config.test?.maxWorkers).toBe(expectedWorkers)
      expect(process.env.VITEST_MAX_WORKERS).toBe(String(expectedWorkers))
    }
  })

  it('gives every GitHub Actions postgres service the shared CI server settings', () => {
    expect(postgresPolicyErrors(postgresPolicySources)).toEqual([])
    expect(
      postgresPolicyErrors({
        ...postgresPolicySources,
        '.github/workflows/unit.yml': postgresPolicySources['.github/workflows/unit.yml'].replace(
          requiredInitdbArgs,
          '-c max_connections=20 -c log_min_messages=log',
        ),
      }),
    ).toEqual([
      '.github/workflows/unit.yml#test POSTGRES_INITDB_ARGS must equal -c max_connections=300 -c log_min_messages=log',
    ])
  })

  it('requires the smoke workflow to call the tracked helper with shared Docker settings', () => {
    const workflowPath = '.github/workflows/initialize-smoke-test.yml'
    const scriptPath = '.github/workflows/initialize-smoke-test/prepare-postgres.sh'
    expect(postgresPolicyErrors(postgresPolicySources)).toEqual([])
    expect(
      postgresPolicyErrors({
        ...postgresPolicySources,
        [workflowPath]: postgresPolicySources[workflowPath]!.replace(
          'prepare-postgres.sh',
          'wrong-script.sh',
        ),
      }),
    ).toEqual([
      '.github/workflows/initialize-smoke-test.yml must run the shared Docker postgres preparation script',
    ])
    expect(
      postgresPolicyErrors({
        ...postgresPolicySources,
        [scriptPath]: postgresPolicySources[scriptPath]!.replace(
          requiredDockerInitdbArgs,
          'POSTGRES_INITDB_ARGS="-c max_connections=20"',
        ),
      }),
    ).toEqual([
      '.github/workflows/initialize-smoke-test/prepare-postgres.sh must use the shared Docker postgres settings',
    ])
    expect(
      postgresPolicyErrors(
        Object.fromEntries(
          Object.entries(postgresPolicySources).filter(([path]) => path !== scriptPath),
        ),
      ),
    ).toEqual([
      '.github/workflows/initialize-smoke-test/prepare-postgres.sh must use the shared Docker postgres settings',
    ])
  })
})
