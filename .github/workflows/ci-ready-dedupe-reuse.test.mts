import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import {
  artifactList,
  executeReadyDedupe,
  prJson,
  recordedState,
  workflowRun,
  workflowRuns,
} from './ci-ready-dedupe-test-helpers.mts'

type Workflow = {
  jobs?: Record<
    string,
    {
      if?: string
      outputs?: Record<string, string>
      strategy?: { 'max-parallel'?: number; matrix?: Record<string, string> }
    }
  >
}

const workflowSource = readFileSync('.github/workflows/ci-ready-dedupe.yml', 'utf8')
const workflow = load(workflowSource) as Workflow
const readyScript = readFileSync('ci/ready-dedupe.sh', 'utf8')

function expectFullSuite(outputs: Record<string, string>): void {
  expect(outputs).toMatchObject({
    'skip-settled-producers': 'false',
    'skip-ci-producers': 'false',
    'reused-run-id': '',
    'reused-producers-json': '[]',
  })
}

describe('CI ready dedupe recorded-state reuse', () => {
  it('reports every successful recorded producer and excludes skipped producers', () => {
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      prResponse: prJson(false, []),
    })

    expect(outputs).toMatchObject({
      'skip-settled-producers': 'true',
      'reused-run-id': '888',
      'reused-producers-json': '["test-backend-unit","test-web"]',
    })
  })

  it.each(['failure', 'cancelled'])('does not mask a %s producer', result => {
    expect.hasAssertions()
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      stateResponse: recordedState({ producers: { 'test-web': result } }),
    })
    expectFullSuite(outputs)
  })

  it.each([
    ['tested SHA mismatch', { testedSha: 'other-sha' }],
    ['head SHA mismatch', { headSha: 'other-head' }],
    ['PR mismatch', { prNumber: 9000 }],
    ['unknown producer result', { producers: { 'test-web': 'timed_out' } }],
  ])('fails open for %s', (_case, overrides) => {
    expect.hasAssertions()
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      stateResponse: recordedState(overrides),
    })
    expectFullSuite(outputs)
  })

  it.each([
    ['expired artifact', artifactList(999, true), recordedState(), 0],
    ['absent artifact', '{"artifacts":[]}', recordedState(), 0],
    ['malformed artifact list', '{bad json', recordedState(), 0],
    ['malformed state', artifactList(), '{bad json', 0],
    ['unreadable ZIP', artifactList(), recordedState(), 1],
  ])('fails open for %s', (_case, artifactsResponse, stateResponse, zipExit) => {
    expect.hasAssertions()
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      artifactsResponse,
      stateResponse,
      zipExit,
    })
    expectFullSuite(outputs)
  })

  it('fails open when the artifact has no numeric originating run', () => {
    expect.hasAssertions()
    const artifactsResponse = JSON.stringify({
      artifacts: [
        {
          id: 999,
          expired: false,
          created_at: '2026-01-01T00:00:00Z',
          workflow_run: {},
        },
      ],
    })
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      artifactsResponse,
    })
    expectFullSuite(outputs)
  })

  it('rejects state from a foreign workflow or unsuccessful run', () => {
    expect.hasAssertions()
    for (const runResponse of [
      workflowRun({ path: '.github/workflows/foreign.yml' }),
      workflowRun({ conclusion: 'failure' }),
    ]) {
      expectFullSuite(executeReadyDedupe({ eventAction: 'ready_for_review', runResponse }).outputs)
    }
  })

  it('selects the newest unexpired artifact before validating its origin', () => {
    const artifactsResponse = JSON.stringify({
      artifacts: [
        {
          id: 998,
          expired: false,
          created_at: '2026-01-01T00:00:00Z',
          workflow_run: { id: 887 },
        },
        {
          id: 999,
          expired: false,
          created_at: '2026-01-02T00:00:00Z',
          workflow_run: { id: 888 },
        },
      ],
    })
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      artifactsResponse,
    })
    expect(outputs['reused-run-id']).toBe('888')
    expect(outputs['skip-settled-producers']).toBe('true')
  })

  it('rejects a newer attempt whose test processing failed', () => {
    expect.hasAssertions()
    const artifactsResponse = JSON.stringify({
      artifacts: [
        {
          id: 998,
          expired: false,
          created_at: '2026-01-01T00:00:00Z',
          workflow_run: { id: 887 },
        },
        {
          id: 999,
          expired: false,
          created_at: '2026-01-02T00:00:00Z',
          workflow_run: { id: 888 },
        },
      ],
    })
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      artifactsResponse,
      stateResponse: recordedState({ processingResult: 'failure' }),
    })
    expectFullSuite(outputs)
  })

  it('rejects hostile producer keys and keeps the reporter shell interpolation-free', () => {
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      stateResponse: recordedState({ producers: { '$(touch-pwned)': 'success' } }),
    })
    expectFullSuite(outputs)
    expect(workflowSource).toContain('PRODUCER: ${{ matrix.producer }}')
    expect(workflowSource).not.toContain('"## ${{ matrix.producer }} reused"')
    expect(readyScript).toContain('/ci-state.XXXXXX"')
    expect(readyScript).not.toContain('/ci-state.XXXXXX.zip')
    expect(readyScript).toContain('zipfile.ZipFile')
    expect(readyScript).toContain('gh api --paginate --slurp')
    expect(readyScript).not.toContain('unzip')
  })

  it('fails open when temporary state storage cannot be allocated', () => {
    expect.hasAssertions()
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      tempAvailable: false,
    })
    expectFullSuite(outputs)
  })

  it('rejects an older artifact when a newer prior CI run has no state', () => {
    expect.hasAssertions()
    const runsResponse = workflowRuns([
      {
        id: 12_345,
        created_at: '2026-01-04T00:00:00Z',
        head_sha: 'head-sha',
        pull_requests: [{ number: 8277 }],
      },
      {
        id: 889,
        created_at: '2026-01-03T00:00:00Z',
        head_sha: 'head-sha',
        pull_requests: [{ number: 8277 }],
      },
      {
        id: 888,
        created_at: '2026-01-02T00:00:00Z',
        head_sha: 'head-sha',
        pull_requests: [{ number: 8277 }],
      },
    ])
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      runsResponse,
    })
    expectFullSuite(outputs)
  })

  it.each([
    ['unavailable', '[]', 1],
    ['malformed', '{bad json', 0],
  ])('fails open when the prior-run list is %s', (_case, runsResponse, runsExit) => {
    expect.hasAssertions()
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      runsResponse,
      runsExit,
    })
    expectFullSuite(outputs)
  })

  it('skips all producers for a recorded non-deferred run', () => {
    const { outputs } = executeReadyDedupe({
      eventAction: 'ready_for_review',
      stateResponse: recordedState({ deferred: false }),
    })
    expect(outputs).toMatchObject({
      'skip-ci-producers': 'true',
      'skip-settled-producers': 'false',
    })
  })

  it('publishes generic reuse outputs and a serial reporter matrix', () => {
    const ready = workflow.jobs?.['ready-dedupe']
    const reporter = workflow.jobs?.['report-reused-producers']

    expect(ready?.outputs).toMatchObject({
      'reused-run-id': '${{ steps.ready-dedupe.outputs.reused-run-id }}',
      'reused-producers-json': '${{ steps.ready-dedupe.outputs.reused-producers-json }}',
    })
    expect(reporter?.if).toBe("${{ needs.ready-dedupe.outputs.reused-producers-json != '[]' }}")
    expect(reporter?.strategy?.['max-parallel']).toBe(1)
    expect(reporter?.strategy?.matrix?.producer).toBe(
      '${{ fromJSON(needs.ready-dedupe.outputs.reused-producers-json) }}',
    )
  })
})
