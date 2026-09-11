import { readdirSync, readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { maxCiVitestWorkers } from '../../test-helpers/vitest-config/environment.mts'

const pgvectorImagePattern = /pgvector\/pgvector:[^\s'"\\)]+/g
const workflowDirectory = '.github/workflows'
const ciPostgresMaxConnections = 300
const requiredInitdbArgs = `-c max_connections=${ciPostgresMaxConnections}`
const requiredDockerInitdbArgs = `POSTGRES_INITDB_ARGS="${requiredInitdbArgs}"`

// Every postgres service must use exactly `requiredInitdbArgs`, except a workflow explicitly
// named here — each entry documents why that one job needs a different, still-fixed value.
// explain-analyze.yml pins work_mem so its zero-tolerance disk-spill gate runs deterministically
// against a declared value instead of Postgres's stock 4MB default (see the inline comment on
// that workflow's POSTGRES_INITDB_ARGS for the evidence behind 32MB). explain-analyze.mts also
// issues `SET LOCAL work_mem` per capture (EXPLAIN_WORK_MEM) so a local run reaches the same
// verdict as CI (#11081) — the two values must stay equal; this server-level default still covers
// planning outside the capture transaction (db:migrate, explain:seed) that the per-capture
// SET LOCAL does not reach.
const initdbArgsExceptions: Record<string, string> = {
  'explain-analyze.yml': `${requiredInitdbArgs} -c work_mem=32MB`,
}

type WorkflowJob = {
  services?: {
    postgres?: {
      env?: Record<string, string>
    }
  }
}

type WorkflowDocument = {
  jobs?: Record<string, WorkflowJob>
}

type VitestConfig = {
  test?: {
    maxWorkers?: number | string
  }
}

function workflowYamlFiles(): string[] {
  return readdirSync(workflowDirectory).filter(
    name => name.endsWith('.yml') || name.endsWith('.yaml'),
  )
}

function readWorkflow(name: string): string {
  return readFileSync(`${workflowDirectory}/${name}`, 'utf8')
}

function postgresServiceJobs(
  name: string,
): Array<{ jobName: string; initdbArgs: string | undefined }> {
  const workflow = load(readWorkflow(name)) as WorkflowDocument
  return Object.entries(workflow.jobs ?? {})
    .filter(([, job]) => job.services?.postgres)
    .map(([jobName, job]) => ({
      jobName,
      initdbArgs: job.services?.postgres?.env?.POSTGRES_INITDB_ARGS,
    }))
}

describe('PostgreSQL workflow image policy', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('keeps every pgvector image reference on one immutable digest', () => {
    const references = workflowYamlFiles().flatMap(name =>
      [...readWorkflow(name).matchAll(pgvectorImagePattern)].map(([reference]) => reference),
    )

    expect(references.length).toBeGreaterThan(0)
    expect(new Set(references)).toEqual(
      new Set([
        'pgvector/pgvector:pg18@sha256:691673308c99d2161ba298736f3147f1f22d79de2fb7ec93ae9b4afcab870b62',
      ]),
    )
  })

  it('sizes CI postgres above the default Vitest fork connection budget', () => {
    const vitestMaxWorkers = maxCiVitestWorkers
    const testPoolMax = 20
    const advisoryLockMax = 4
    const globalSetupProcess = 1
    const superuserReservedConnections = 3
    const worstCaseBudget =
      (vitestMaxWorkers + globalSetupProcess) * (testPoolMax + testPoolMax + advisoryLockMax) +
      superuserReservedConnections

    expect(ciPostgresMaxConnections).toBeGreaterThanOrEqual(worstCaseBudget)
  })

  it('caps effective CI Vitest worker overrides at the postgres-compatible maximum', async () => {
    vi.stubEnv('CI', 'true')

    expect(maxCiVitestWorkers).toBe(5)
    for (const [configuredWorkers, expectedWorkers] of [
      ['5', 5],
      ['6', maxCiVitestWorkers],
      ['100%', 4],
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

  it('raises every GitHub Actions postgres service above the default max_connections', () => {
    const postgresServices = workflowYamlFiles().flatMap(name =>
      postgresServiceJobs(name).map(job => ({ workflow: name, ...job })),
    )

    expect(postgresServices.length).toBeGreaterThan(0)
    expect(postgresServices).toEqual(
      postgresServices.map(service => ({
        ...service,
        initdbArgs: initdbArgsExceptions[service.workflow] ?? requiredInitdbArgs,
      })),
    )
  })

  it('raises the initialize-smoke docker postgres above the default max_connections', () => {
    expect(readWorkflow('initialize-smoke-test.yml')).toContain(requiredDockerInitdbArgs)
  })
})
