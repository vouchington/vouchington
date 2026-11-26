import { describe, expect, it } from 'vitest'

import {
  liveTopologyAuditErrors,
  noMistakesPolicyInvocationErrors,
} from './check-live-workflow-topology.mts'
import { makeJob, makeTopology, makeWorkflow } from './workflow-topology-test-fixtures.mts'

describe('live topology audit', () => {
  it('requires the real static-analysis job to invoke the independent policy checker once', () => {
    const job = makeJob({
      id: '.github/workflows/static-code-analysis.yml#no-mistakes',
      steps: [
        { index: 0, kind: 'run', run: 'set -e\n  node\tci/check-no-mistakes-test-policy.mts  \n' },
      ],
    })
    expect(noMistakesPolicyInvocationErrors(makeTopology({ jobs: [job] }))).toEqual([])
    expect(noMistakesPolicyInvocationErrors(makeTopology())).toEqual([
      expect.stringContaining('must invoke node ci/check-no-mistakes-test-policy.mts exactly once'),
    ])
    expect(liveTopologyAuditErrors(makeTopology())).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          'must invoke node ci/check-no-mistakes-test-policy.mts exactly once',
        ),
      ]),
    )
    expect(
      noMistakesPolicyInvocationErrors(
        makeTopology({
          jobs: [{ ...job, steps: [{ index: 0, kind: 'run', run: 'node ci/other-check.mts' }] }],
        }),
      ),
    ).toEqual([expect.stringContaining('(found 0)')])
    expect(
      noMistakesPolicyInvocationErrors(
        makeTopology({ jobs: [{ ...job, steps: [job.steps[0]!, job.steps[0]!] }] }),
      ),
    ).toEqual([expect.stringContaining('(found 2)')])
  })

  it('surfaces topology diagnostics before permission or inventory checks', () => {
    expect(
      liveTopologyAuditErrors(
        makeTopology({
          diagnostics: [
            {
              severity: 'error',
              code: 'malformed-workflow',
              message: 'broken yaml',
              workflowPath: '.github/workflows/broken.yml',
            },
          ],
        }),
      ),
    ).toEqual(['.github/workflows/broken.yml: broken yaml'])
  })

  it('reports missing secret inventory entries once diagnostics are empty', () => {
    expect(
      liveTopologyAuditErrors(
        makeTopology({
          workflows: [
            makeWorkflow({
              id: 'wf',
              path: 'fixture/wf.yml',
              secretReferences: ['UNKNOWN_FIXTURE_SECRET'],
            }),
          ],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'secret UNKNOWN_FIXTURE_SECRET is referenced with no SECRET_INVENTORY entry',
      ]),
    )
  })
})
