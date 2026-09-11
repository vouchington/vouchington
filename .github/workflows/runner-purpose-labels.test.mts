import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, it } from 'vitest'

import { assertNoWorkflowViolations } from './workflow-test-helpers.mts'

type Workflow = {
  jobs?: Record<
    string,
    {
      'runs-on'?: string | string[]
      steps?: Array<{
        run?: string
        uses?: string
      }>
    }
  >
}

const workflowPaths = readdirSync('.github/workflows').flatMap(path =>
  path.endsWith('.yml') || path.endsWith('.yaml') ? [`.github/workflows/${path}`] : [],
)

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

describe('workflow runner purpose labels', () => {
  it('runs self-hosted Vitest command jobs on Tests runners', () => {
    const exemptJobs = new Set([
      // Storybook browser validation intentionally uses the Playwright pool because
      // the same job installs Chromium and runs browser-backed Storybook tests.
      '.github/workflows/storybook.yml#storybook',
    ])
    const violations: string[] = []

    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        const invokesVitest =
          job.steps?.some(step => /\bvitest\s+run\b/.test(step.run ?? '')) ?? false
        if (!invokesVitest) continue
        if (exemptJobs.has(`${path}#${jobId}`)) continue

        const runsOn = job['runs-on']
        if (!Array.isArray(runsOn)) continue
        if (runsOn.includes('self-hosted') && !runsOn.includes('Tests')) {
          violations.push(`${path.replace(/^\.github\/workflows\//, '')}#${jobId}`)
        }
      }
    }

    assertNoWorkflowViolations(violations)
  })

  it('runs Playwright command jobs on Playwright runners', () => {
    const violations: string[] = []

    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        const invokesPlaywright =
          job.steps?.some(
            step =>
              /\bplaywright\s+(?:test|install)\b/.test(step.run ?? '') ||
              /setup-playwright/.test(step.uses ?? ''),
          ) ?? false
        if (!invokesPlaywright) continue

        const runsOn = job['runs-on']
        if (!Array.isArray(runsOn)) continue
        if (runsOn.includes('self-hosted') && !runsOn.includes('Playwright')) {
          violations.push(`${path.replace(/^\.github\/workflows\//, '')}#${jobId}`)
        }
      }
    }

    assertNoWorkflowViolations(violations)
  })
})
