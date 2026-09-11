import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import * as ciLiveLabelsFixture from './ci-live-labels-fixture.mts'
import { executeReadyDedupe, prJson, recordedState } from './ci-ready-dedupe-test-helpers.mts'

const { detectOutputs, readyJob, selectStep } = ciLiveLabelsFixture

type Workflow = {
  jobs?: Record<
    string,
    {
      if?: string
      outputs?: Record<string, string>
      steps?: { env?: Record<string, string>; name?: string }[]
      with?: Record<string, string>
    }
  >
}

const workflow = load(readFileSync('.github/workflows/ci.yml', 'utf8')) as Workflow

describe('CI live full-suite labels', () => {
  it('publishes compact live labels and exact suite booleans', () => {
    expect(
      executeReadyDedupe({ prResponse: prJson(false, ['documentation', 'vitest:full']) }).outputs,
    ).toMatchObject({
      'pr-labels-json': '["documentation","vitest:full"]',
      'has-playwright-full': 'false',
      'has-vitest-full': 'true',
      'skip-expensive-jobs': 'false',
      'skip-settled-producers': 'false',
      'skip-ci-producers': 'false',
    })
  })

  it.each([
    ['API failure', '{}', 1],
    ['malformed API output', 'not-json', 0],
  ])('fails open to both suites after %s', (_name, response, exitCode) => {
    const outputs = executeReadyDedupe({ prResponse: response, prExit: exitCode }).outputs
    expect(JSON.parse(outputs['pr-labels-json'] ?? '[]')).toEqual([
      'playwright:full',
      'vitest:full',
    ])
    expect(outputs['has-playwright-full']).toBe('true')
    expect(outputs['has-vitest-full']).toBe('true')
    expect(outputs['skip-expensive-jobs']).toBe('false')
    expect(outputs['skip-settled-producers']).toBe('false')
  })

  it('defers expensive jobs on live drafts without full-suite labels', () => {
    expect(executeReadyDedupe({ prResponse: prJson(true, []) }).outputs).toMatchObject({
      'skip-expensive-jobs': 'true',
      'skip-settled-producers': 'false',
      'skip-ci-producers': 'false',
    })
  })

  it('does not defer expensive jobs on a draft with playwright:full', () => {
    expect(
      executeReadyDedupe({ prResponse: prJson(true, ['playwright:full']) }).outputs,
    ).toMatchObject({
      'skip-expensive-jobs': 'false',
      'has-playwright-full': 'true',
    })
  })

  it('does not defer expensive jobs on a draft with vitest:full', () => {
    expect(executeReadyDedupe({ prResponse: prJson(true, ['vitest:full']) }).outputs).toMatchObject(
      {
        'skip-expensive-jobs': 'false',
        'has-vitest-full': 'true',
      },
    )
  })

  it('fails open to expensive jobs when the draft field is malformed', () => {
    expect(
      executeReadyDedupe({
        prResponse: JSON.stringify({ draft: 'maybe', labels: [] }),
      }).outputs,
    ).toMatchObject({
      'skip-expensive-jobs': 'false',
      'skip-ci-producers': 'false',
    })
  })

  it('does not defer expensive jobs on ready_for_review even if live draft is stale true', () => {
    const outputs = executeReadyDedupe({
      eventAction: 'ready_for_review',
      prResponse: prJson(true, []),
    }).outputs
    expect(outputs).toMatchObject({
      'skip-expensive-jobs': 'false',
      'skip-settled-producers': 'true',
      'skip-ci-producers': 'false',
    })
  })

  it('skips settled producers when ready_for_review follows a deferred draft run', () => {
    const outputs = executeReadyDedupe({
      eventAction: 'ready_for_review',
      prResponse: prJson(false, []),
    }).outputs
    expect(outputs).toMatchObject({
      'skip-ci-producers': 'false',
      'skip-settled-producers': 'true',
      'skip-expensive-jobs': 'false',
    })
  })

  it('skips all producers when ready_for_review duplicates a complete run', () => {
    const outputs = executeReadyDedupe({
      eventAction: 'ready_for_review',
      prResponse: prJson(false, []),
      stateResponse: recordedState({ deferred: false }),
    }).outputs
    expect(outputs).toMatchObject({
      'skip-ci-producers': 'true',
      'skip-settled-producers': 'false',
      'skip-expensive-jobs': 'false',
    })
  })

  it('fails open when ready_for_review cannot list recorded state', () => {
    const outputs = executeReadyDedupe({
      eventAction: 'ready_for_review',
      prResponse: prJson(false, []),
      artifactsExit: 1,
    }).outputs
    expect(outputs).toMatchObject({
      'skip-ci-producers': 'false',
      'skip-settled-producers': 'false',
      'skip-expensive-jobs': 'false',
    })
  })

  it('forwards live labels to both selectors instead of the triggering event payload', () => {
    const playwright = workflow.jobs?.['test-playwright']
    expect(readyJob?.outputs).toHaveProperty('pr-labels-json')
    expect(readyJob?.outputs).toHaveProperty('skip-expensive-jobs')
    expect(readyJob?.outputs).toHaveProperty('skip-settled-producers')
    expect(detectOutputs).toHaveProperty('pr-labels-json')
    expect(detectOutputs).toHaveProperty('skip-expensive-jobs')
    expect(detectOutputs).toHaveProperty('skip-settled-producers')
    expect(selectStep?.env?.PR_LABELS).toBe(
      "${{ inputs.detect-changes-outputs-pr-labels-json || '[]' }}",
    )
    expect(playwright?.with?.['pr-labels']).toBe(
      "${{ needs.detect-changes.outputs.pr-labels-json || '[]' }}",
    )
    expect(playwright?.if).toContain("needs.detect-changes.outputs.has-playwright-full == 'true'")
  })
})
