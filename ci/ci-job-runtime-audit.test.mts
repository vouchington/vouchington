import { describe, expect, it } from 'vitest'

import {
  auditCiJobRuntime,
  vouchingtonRuntimeAuditOptions,
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
  event: 'pull_request' | 'merge_group' | 'push',
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
          ...['Static', 'Backend', 'Web', 'Cloudflare Worker', 'Lambdas', 'Tooling'].map(
            (name, index) => ({ id: index + 1, name, state: 'active' }),
          ),
          { id: 7, name: 'Main CI (web)', state: 'active' },
          { id: 8, name: 'Other', state: 'active' },
        ],
      }
    }
    const workflowId = endpoint.match(/\/actions\/workflows\/(\d+)\/runs\?/)
    if (workflowId) {
      const workflowName =
        workflowId[1] === '7'
          ? 'Main CI (web)'
          : workflowId[1] === '8'
            ? 'Other'
            : ['Static', 'Backend', 'Web', 'Cloudflare Worker', 'Lambdas', 'Tooling'][
                Number(workflowId[1]) - 1
              ]
      const event = new URLSearchParams(endpoint.split('?')[1]).get('event')
      return {
        workflow_runs: runs.filter(
          run =>
            (run as { name?: string; event?: string }).name === workflowName &&
            (run as { event?: string }).event === event,
        ),
      }
    }
    const match = endpoint.match(/\/actions\/runs\/(\d+)\/jobs/)
    if (!match) throw new Error(`Unexpected endpoint: ${endpoint}`)
    return { jobs: jobsByRun[Number(match[1])] }
  }
}

describe('CI job runtime audit wrapper', () => {
  it('keeps area pull_request and merge_group plus Main CI push filters', () => {
    expect(vouchingtonRuntimeAuditOptions).toEqual({
      branch: 'main',
      workflows: [
        { name: 'Static', event: 'pull_request' },
        { name: 'Backend', event: 'pull_request' },
        { name: 'Web', event: 'pull_request' },
        { name: 'Cloudflare Worker', event: 'pull_request' },
        { name: 'Lambdas', event: 'pull_request' },
        { name: 'Tooling', event: 'pull_request' },
        { name: 'Static', event: 'merge_group' },
        { name: 'Backend', event: 'merge_group' },
        { name: 'Web', event: 'merge_group' },
        { name: 'Cloudflare Worker', event: 'merge_group' },
        { name: 'Lambdas', event: 'merge_group' },
        { name: 'Tooling', event: 'merge_group' },
        { name: /^Main CI \(.+\)$/, event: 'push' },
      ],
      medianThresholdSeconds: 480,
    })
  })

  it('scopes area PR and merge-group runs plus main, excluding other workflows', async () => {
    const runs = [
      ...[16, 15, 14, 13, 12, 11].map(id => makeRun(id, 'Backend', 'pull_request')),
      ...[10, 9, 8, 7, 6, 5].map(id => makeRun(id, 'Backend', 'merge_group')),
      makeRun(17, 'Backend', 'pull_request', 'release'),
      makeRun(2, 'Main CI (web)', 'push'),
      makeRun(18, 'Main CI (web)', 'push', 'release'),
      makeRun(19, 'Other', 'push'),
    ]
    const jobs = Object.fromEntries(
      runs.map(run => {
        const id = (run as { id: number }).id
        return [id, [makeJob(id, 'test', 300 + id, 12)]]
      }),
    )

    const result = await auditCiJobRuntime(makeExecutor(runs, jobs), 'owner/repo')

    expect(result.jobs.map(job => job.key)).toEqual(['Backend / test', 'Main CI (web) / test'])
    expect(result.jobs[0]?.samples.map(sample => sample.runId)).toEqual([16, 15, 14, 13, 12])
    expect(result.jobs[0]?.samples[0]?.durationSeconds).toBe(316)
  })
})
