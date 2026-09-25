import { readFileSync } from 'node:fs'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { workflowRunSubscriptions, workflowTriggerNames } from './workflow-test-helpers.mts'

type Step = {
  name?: string
  id?: string
  if?: string
  env?: Record<string, string>
  run?: string
  uses?: string
  with?: Record<string, unknown>
}

type Job = {
  name?: string
  if?: string
  needs?: string | string[]
  'runs-on'?: string | string[]
  'timeout-minutes'?: number
  permissions?: Record<string, string>
  concurrency?: { group?: string; queue?: string; 'cancel-in-progress'?: boolean }
  outputs?: Record<string, string>
  steps?: Step[]
}

type Workflow = {
  name?: string
  on?: unknown
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  permissions?: Record<string, string>
  jobs?: Record<string, Job>
}

const fixMainSelfRetry = readFileSync('.github/workflows/fix-main-self-retry.yml', 'utf8')
const parsed = load(fixMainSelfRetry) as Workflow
const retryJob = parsed.jobs?.['retry']
const escalateJob = parsed.jobs?.['escalate-retry-failure']

describe('fix-main-self-retry workflow', () => {
  it('subscribes only to Automation Fix Main via workflow_run, with no other trigger', () => {
    expect(workflowTriggerNames(parsed.on)).toEqual(['workflow_run'])
    expect(workflowRunSubscriptions(parsed.on)).toEqual(['Automation Fix Main'])
  })

  it('never subscribes to itself, which would create an unbounded run chain', () => {
    expect(parsed.name).toBe('Fix Main Self Retry')
    expect(workflowRunSubscriptions(parsed.on)).not.toContain(parsed.name)
  })

  it('never gains a push-on-main trigger, which would force it into fix-main.yml subscription list', () => {
    expect(parsed.on).not.toHaveProperty('push')
  })

  it('gates on the same Harness gates, same-repo main, failure, and a structural run-attempt ceiling', () => {
    expect(retryJob?.if).toContain("vars.HARNESS_DISPATCH_ENABLED == 'true'")
    expect(retryJob?.if).toContain("vars.HARNESS_FIX_MAIN_ENABLED == 'true'")
    expect(retryJob?.if).toContain("github.event.workflow_run.head_branch == 'main'")
    expect(retryJob?.if).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository',
    )
    expect(retryJob?.if).toContain("github.event.workflow_run.conclusion == 'failure'")
    expect(retryJob?.if).toContain('github.event.workflow_run.run_attempt < 3')
  })

  it('runs on ubuntu-latest with a bounded timeout and explicit permissions', () => {
    expect(retryJob?.['runs-on']).toEqual('ubuntu-latest')
    expect(retryJob?.['timeout-minutes']).toBeLessThanOrEqual(10)
    expect(retryJob?.permissions).toEqual({
      actions: 'write',
      checks: 'read',
      contents: 'read',
    })
  })

  it('revalidates the source run before classification and any rerun', () => {
    const sourceStateStep = retryJob?.steps?.find(s => s.id === 'source-state')
    const decideStep = retryJob?.steps?.find(s => s.id === 'decide')
    const stepIds = retryJob?.steps?.map(s => s.id).filter(Boolean)

    expect(stepIds?.indexOf('source-state')).toBeLessThan(stepIds?.indexOf('decide') ?? -1)
    expect(sourceStateStep?.if).toBeUndefined()
    expect(sourceStateStep?.run).toBe('node ci/source-run-state.mts')
    expect(sourceStateStep?.env).toMatchObject({
      SOURCE_RUN_ATTEMPT: '${{ github.event.workflow_run.run_attempt }}',
      SOURCE_RUN_CONCLUSION: '${{ github.event.workflow_run.conclusion }}',
      SOURCE_RUN_ID: '${{ github.event.workflow_run.id }}',
    })
    expect(decideStep?.if).toBe("steps.source-state.outputs.current == 'true'")
    expect(decideStep?.run).toBe('node ci/transient-retry/decide.mts')
  })

  it('reruns only the failed jobs on a transient match — never a bare full-run rerun', () => {
    const failedJobsRerunStep = retryJob?.steps?.find(
      s => s.name === 'Rerun failed jobs on transient match',
    )

    expect(failedJobsRerunStep?.if).toBe(
      "steps.source-state.outputs.current == 'true' && steps.decide.outputs.decision == 'rerun'",
    )
    expect(failedJobsRerunStep?.run).toContain(
      'gh run rerun --repo "$GITHUB_REPOSITORY" --failed "$SOURCE_RUN_ID"',
    )

    const rerunSteps = retryJob?.steps?.filter(s => s.run?.includes('gh run rerun')) ?? []
    expect(rerunSteps).toEqual([failedJobsRerunStep])
  })

  it('the retry job itself never escalates — no issues permission at the retry job or workflow level', () => {
    expect(retryJob?.permissions).not.toHaveProperty('issues')
    expect(parsed.permissions).toEqual({ contents: 'read' })
  })

  it('checks whether the original Fix Main run already escalated, via the Jobs API scoped to its attempt', () => {
    const escalateStateStep = retryJob?.steps?.find(s => s.id === 'escalate-state')
    const stepIds = retryJob?.steps?.map(s => s.id).filter(Boolean)

    expect(escalateStateStep?.if).toBe('always()')
    expect(escalateStateStep?.env).toMatchObject({
      SOURCE_RUN_ATTEMPT: '${{ github.event.workflow_run.run_attempt }}',
      SOURCE_RUN_ID: '${{ github.event.workflow_run.id }}',
    })
    expect(escalateStateStep?.run).toContain(
      'repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN_ID/attempts/$SOURCE_RUN_ATTEMPT/jobs',
    )
    expect(escalateStateStep?.run).toContain('select(.name == "Escalate to human")')
    expect(escalateStateStep?.run).toContain('conclusion=')
    expect(stepIds?.indexOf('escalate-state')).toBeLessThan(stepIds?.indexOf('disposition') ?? -1)
  })

  it('records a disposition after every rerun attempt, run regardless of earlier step failure', () => {
    const dispositionStep = retryJob?.steps?.find(s => s.id === 'disposition')

    expect(dispositionStep?.if).toBe('always()')
    expect(dispositionStep?.env).toMatchObject({
      SOURCE_OUTCOME: '${{ steps.source-state.outcome }}',
      SOURCE_CURRENT: '${{ steps.source-state.outputs.current }}',
      DECISION: '${{ steps.decide.outputs.decision }}',
      FAILED_JOBS_RERUN_OUTCOME: '${{ steps.rerun-failed-jobs.outcome }}',
      ESCALATE_STATE_OUTCOME: '${{ steps.escalate-state.outcome }}',
      ESCALATE_CONCLUSION: '${{ steps.escalate-state.outputs.conclusion }}',
    })
    expect(dispositionStep?.run).toContain('disposition=handled')
    expect(dispositionStep?.run).toContain('disposition=unhandled')
    expect(dispositionStep?.run).toContain(
      '"$ESCALATE_STATE_OUTCOME" == "success" && "$ESCALATE_CONCLUSION" == "success"',
    )
    expect(dispositionStep?.run).toContain('"$SOURCE_CURRENT" == "false"')
    expect(retryJob?.outputs).toEqual({
      disposition: '${{ steps.disposition.outputs.disposition }}',
    })

    const failedJobsRerunStep = retryJob?.steps?.find(
      s => s.name === 'Rerun failed jobs on transient match',
    )
    expect(failedJobsRerunStep?.id).toBe('rerun-failed-jobs')
  })

  it('escalates only when the retry job ran but recorded no handled disposition', () => {
    expect(escalateJob).toBeDefined()
    expect(escalateJob?.needs).toEqual(['retry'])
    expect(escalateJob?.if).toContain('always()')
    expect(escalateJob?.if).toContain("needs.retry.result != 'skipped'")
    expect(escalateJob?.if).toContain("needs.retry.outputs.disposition != 'handled'")
    expect(escalateJob?.permissions).toEqual({ issues: 'write' })
  })

  it('escalation issue body points at the Fix Main run, not the monitored workflow', () => {
    const step = escalateJob?.steps?.[0]

    expect(step?.env).toMatchObject({
      FIX_MAIN_RUN_ID: '${{ github.event.workflow_run.id }}',
      FIX_MAIN_RUN_URL: '${{ github.event.workflow_run.html_url }}',
      FIX_MAIN_RUN_ATTEMPT: '${{ github.event.workflow_run.run_attempt }}',
    })
    expect(step?.run).toContain('Fix Main self-retry incomplete: run $FIX_MAIN_RUN_ID')
    expect(step?.run).toContain('gh issue list')
    expect(step?.run).toContain('--search "\\"$TITLE\\" in:title"')
    expect(step?.run).toContain('gh issue comment')
    expect(step?.run).toContain('gh issue create')
    expect(step?.run).toContain('--label "automation"')
    expect(step?.run).toContain('--label "needs-human"')
  })

  it('uses a per-watcher-run concurrency group so independent Fix Main runs never cross-cancel', () => {
    expect(parsed.concurrency?.group).toBe('fix-main-self-retry-${{ github.run_id }}')
    expect(parsed.concurrency?.['cancel-in-progress']).toBe(false)
  })
})
