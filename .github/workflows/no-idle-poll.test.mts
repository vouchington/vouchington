import { readFileSync, readdirSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, it } from 'vitest'

import { assertWorkflowInvariant } from './workflow-test-helpers.mts'

type Workflow = {
  jobs?: Record<
    string,
    {
      steps?: Array<{ run?: string }>
    }
  >
}

const workflowPaths = readdirSync('.github/workflows').flatMap(path =>
  path.endsWith('.yml') || path.endsWith('.yaml') ? [`.github/workflows/${path}`] : [],
)

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

describe('no idle-poll anti-pattern', () => {
  it('has no jobs that idle-poll a sibling workflow via gh run list', () => {
    // Idle-polling (gh run list --workflow ... --commit ... in a loop) ties up a
    // runner for up to 130 min doing nothing but sleeping 20s between checks.
    // Cross-workflow ordering must be expressed as native needs: dependencies within
    // a single workflow; the root cause (shared state) must be eliminated instead.
    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
        assertWorkflowInvariant(
          !/^wait-/.test(jobName),
          `Job "${jobName}" in ${path} looks like an idle-poll wait job`,
        )

        for (const step of job.steps ?? []) {
          const run = step.run ?? ''
          // Best-effort convention gate: checks literal `run:` strings only.
          // Dynamically-constructed invocations would bypass this; the /^wait-/ job-name
          // convention above is the stronger structural guard.
          const isIdlePoll =
            run.includes('gh run list') && run.includes('--workflow') && run.includes('--commit')
          assertWorkflowInvariant(
            !isIdlePoll,
            `A step in job "${jobName}" in ${path} idle-polls a sibling workflow via "gh run list --workflow ... --commit ...". Use native needs: dependencies instead.`,
          )

          const usesDeletedWaitScript =
            run.includes('ci/wait-for-workflow-run.mts') ||
            run.includes('ci/wait-for-capability.mts')
          assertWorkflowInvariant(
            !usesDeletedWaitScript,
            `A step in job "${jobName}" in ${path} reintroduces a cross-workflow deploy-order wait. Deploys must stay decoupled and forward/backward-compatible instead.`,
          )
        }
      }
    }
  })
})
