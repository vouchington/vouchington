import { describe, expect, it } from 'vitest'

import {
  auditCiJobRuntime,
  filamentsRuntimeAuditOptions,
  type GhApiExecutor,
} from './ci-job-runtime-audit.mts'

type FixtureJob = {
  id: number
  name: string
  started_at: string
  completed_at: string
  conclusion: 'success' | 'failure'
  html_url: string
}

function makeJob(runId: number, name: string, seconds: number, queueMinutes = 0): FixtureJob {
  const started = new Date(Date.UTC(2026, 0, runId, 0, queueMinutes))
  return {
    id: runId * 10,
    name,
    started_at: started.toISOString(),
    completed_at: new Date(started.getTime() + seconds * 1000).toISOString(),
    conclusion: 'success',
    html_url: `https://github.test/jobs/${runId}`,
  }
}

function makeRun(
  id: number,
  name: string,
  event: 'pull_request' | 'push',
  branch = 'main',
): unknown {
  return {
    id,
    name,
    event,
    conclusion: 'success',
    created_at: new Date(Date.UTC(2026, 0, id)).toISOString(),
    html_url: `https://github.test/runs/${id}`,
    head_branch: branch,
    pull_requests: event === 'pull_request' ? [{ base: { ref: branch } }] : [],
  }
}

function makeExecutor(
  runs: unknown[],
  jobsByRun: Readonly<Record<number, FixtureJob[]>>,
): GhApiExecutor {
  return async request => {
    const { endpoint } = request
    if (endpoint.includes('/actions/workflows?')) {
      return {
        workflows: [
          { id: 1, name: 'CI', state: 'active' },
          { id: 2, name: 'Main CI (web)', state: 'active' },
          { id: 3, name: 'Other', state: 'active' },
        ],
      }
    }
    if (endpoint.includes('/actions/workflows/1/runs?')) {
      return { workflow_runs: runs.filter(run => (run as { name?: string }).name === 'CI') }
    }
    if (endpoint.includes('/actions/workflows/2/runs?')) {
      return {
        workflow_runs: runs.filter(run => (run as { name?: string }).name === 'Main CI (web)'),
      }
    }
    const match = endpoint.match(/\/actions\/runs\/(\d+)\/jobs/)
    if (!match) throw new Error(`Unexpected endpoint: ${endpoint}`)
    return { jobs: jobsByRun[Number(match[1])] }
  }
}

describe('CI job runtime audit wrapper', () => {
  it('keeps Vouchington CI pull_request and Main CI push filters', () => {
    expect(filamentsRuntimeAuditOptions).toEqual({
      branch: 'main',
      workflows: [
        { name: 'CI', event: 'pull_request' },
        { name: /^Main CI \(.+\)$/, event: 'push' },
      ],
      medianThresholdSeconds: 480,
    })
  })

  it('scopes successful PR and main runs and excludes other workflows', async () => {
    const runs = [
      ...[7, 6, 5, 4, 3, 2].map(id => makeRun(id, 'CI', 'pull_request')),
      makeRun(8, 'CI', 'pull_request', 'release'),
      makeRun(9, 'Main CI (web)', 'push'),
      makeRun(10, 'Main CI (web)', 'push', 'release'),
      makeRun(11, 'Other', 'push'),
    ]
    const jobs = Object.fromEntries(
      [2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(id => [id, [makeJob(id, 'test', 300 + id, 12)]]),
    )

    const result = await auditCiJobRuntime(makeExecutor(runs, jobs), 'owner/repo')

    expect(result.jobs.map(job => job.key)).toEqual(['CI / test', 'Main CI (web) / test'])
    expect(result.jobs[0]?.samples.map(sample => sample.runId)).toEqual([7, 6, 5, 4, 3])
    expect(result.jobs[0]?.samples[0]?.durationSeconds).toBe(307)
  })
})
