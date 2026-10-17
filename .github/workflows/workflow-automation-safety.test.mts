import { readdirSync, readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, it } from 'vitest'
import {
  assertNoWorkflowViolations,
  gitSubcommandPattern,
  shellLogicalLines,
} from '../test-helpers/workflow-fixtures.mts'

type Step = {
  name?: string
  env?: Record<string, string>
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

type Job = { steps?: Step[] }

type Workflow = {
  name?: string
  on?: unknown
  jobs?: Record<string, Job>
}

const workflowPaths = readdirSync('.github/workflows').flatMap(file =>
  file.endsWith('.yml') || file.endsWith('.yaml') ? [`.github/workflows/${file}`] : [],
)

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function workflowSlug(path: string): string {
  return path.replace(/^\.github\/workflows\//, '').replace(/\.ya?ml$/, '')
}

function stepLabel(path: string, jobId: string, step: Step, index: number): string {
  return `${workflowSlug(path)}#${jobId} step ${step.name ?? index}`
}

describe('workflow automation safety', () => {
  it('disables local hooks for fixed-branch automation commit and branch update steps', () => {
    const commitPattern = gitSubcommandPattern('commit')
    const branchUpdatePattern = gitSubcommandPattern('push')
    const violations: string[] = []

    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        for (const [index, step] of (job.steps ?? []).entries()) {
          if (!step.run) continue
          const label = stepLabel(path, jobId, step, index)
          for (const line of shellLogicalLines(step.run)) {
            if (/^\s*#/.test(line)) continue
            if (commitPattern.test(line) && !/\bcore\.hooksPath=\/dev\/null\b/.test(line)) {
              violations.push(`${label}: commit must use -c core.hooksPath=/dev/null`)
            }
            if (branchUpdatePattern.test(line) && !/\bcore\.hooksPath=\/dev\/null\b/.test(line)) {
              violations.push(`${label}: branch update must use -c core.hooksPath=/dev/null`)
            }
          }
        }
      }
    }

    assertNoWorkflowViolations(violations)
  })

  it('passes GH_TOKEN to scheduled GitHub-backed updater CLIs', () => {
    const violations: string[] = []

    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        for (const [index, step] of (job.steps ?? []).entries()) {
          if (!/\bnpx --yes skills update\b/.test(step.run ?? '')) continue
          if (step.env?.['GH_TOKEN']) continue
          violations.push(`${stepLabel(path, jobId, step, index)}: skills update needs GH_TOKEN`)
        }
      }
    }

    assertNoWorkflowViolations(violations)
  })

  it('pins artifact downloads to an explicit token, repository, and run id', () => {
    // Allowlist intentional same-attempt diagnostic downloads (no token/repository/run-id).
    // Entries use the `stepLabel` form, e.g. `tests#fan-in step Download failed shards`.
    const sameAttemptDiagnosticAllowlist = new Set<string>()
    const violations: string[] = []
    const checkDownload = (label: string, step: Step): void => {
      if (!step.uses?.startsWith('actions/download-artifact@')) return
      if (sameAttemptDiagnosticAllowlist.has(label)) return
      for (const key of ['github-token', 'repository', 'run-id']) {
        if (step.with?.[key]) continue
        violations.push(`${label}: actions/download-artifact must set ${key}`)
      }
    }

    for (const path of workflowPaths) {
      const workflow = readWorkflow(path)
      for (const [jobId, job] of Object.entries(workflow.jobs ?? {})) {
        for (const [index, step] of (job.steps ?? []).entries()) {
          checkDownload(stepLabel(path, jobId, step, index), step)
        }
      }
    }
    assertNoWorkflowViolations(violations)
  })
})
