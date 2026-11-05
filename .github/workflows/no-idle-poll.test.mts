import { describe, expect, it } from 'vitest'
import { workflowSafetyViolations } from '../../ci/workflow-safety-policy.mts'

describe('no idle-poll anti-pattern', () => {
  it('has no jobs that idle-poll a sibling workflow via gh run list', () => {
    expect(
      workflowSafetyViolations('fixture.yml', '', {
        jobs: { deploy: { steps: [{ run: 'node ci/deploy.mts' }] } },
      }),
    ).toEqual([])
    expect(
      workflowSafetyViolations('fixture.yml', '', {
        jobs: {
          'wait-build': {
            steps: [
              { run: 'gh run list --workflow build --commit synthetic' },
              { run: 'node ci/wait-for-workflow-run.mts' },
              { run: 'node ci/wait-for-capability.mts' },
            ],
          },
        },
      }),
    ).toEqual([
      'Job "wait-build" in fixture.yml looks like an idle-poll wait job',
      'fixture#wait-build step 0: idle-polls a sibling workflow via gh run list --workflow --commit',
      'fixture#wait-build step 1: reintroduces a cross-workflow deploy-order wait',
      'fixture#wait-build step 2: reintroduces a cross-workflow deploy-order wait',
    ])
  })
})
