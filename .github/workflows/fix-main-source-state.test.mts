import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { SOURCE_RUN_GUARD_JOB_NAMES } from '../../ci/source-run-guard-shell.mts'
import { fixMain, parsedDispatch, parsedMain } from './fix-main.test-helpers.mts'

const NO_CHECKOUT_SOURCE_STATE_JOBS = SOURCE_RUN_GUARD_JOB_NAMES

describe('fix-main source state', () => {
  it('cancels obsolete automation for the same workflow and source SHA', () => {
    const workflow = load(fixMain) as {
      concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
    }

    expect(workflow.concurrency?.group).toContain('github.event.workflow_run.event')
    expect(workflow.concurrency?.group).toContain('github.event.workflow_run.workflow_id')
    expect(workflow.concurrency?.group).toContain('github.event.workflow_run.head_sha')
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(true)
  })

  it('revalidates the source attempt before both dispatch and escalation', () => {
    const renderJob = parsedMain.jobs?.['render-prompt']
    const sourceStateStep = renderJob?.steps?.find(s => s.id === 'source-state')
    const dispatchJob = parsedMain.jobs?.['dispatch']
    const reusableDispatchJob = parsedDispatch.jobs?.dispatch
    const escalateJob = parsedMain.jobs?.['escalate']
    const escalationSourceStateStep = escalateJob?.steps?.find(s => s.id === 'source-state')
    const escalationIssueStep = escalateJob?.steps?.find(
      s => s.name === 'Escalate to human — open or update issue',
    )

    expect(renderJob?.permissions).toMatchObject({ actions: 'read', contents: 'read' })
    expect(sourceStateStep?.run).toContain('node ci/source-run-state.mts')
    expect(sourceStateStep?.env).toMatchObject({
      SOURCE_RUN_ATTEMPT: '${{ github.event.workflow_run.run_attempt }}',
      SOURCE_RUN_CONCLUSION: '${{ github.event.workflow_run.conclusion }}',
      SOURCE_RUN_ID: '${{ github.event.workflow_run.id }}',
    })
    expect(renderJob?.outputs?.['source-current']).toContain('steps.source-state.outputs.current')
    expect(dispatchJob?.if).toContain("needs.render-prompt.outputs.source-current == 'true'")
    expect(dispatchJob?.with).toMatchObject({
      'source-run-attempt': '${{ github.event.workflow_run.run_attempt }}',
      'source-run-conclusion': '${{ github.event.workflow_run.conclusion }}',
      'source-run-id': '${{ github.event.workflow_run.id }}',
    })

    expect(Object.keys(parsedDispatch.jobs ?? {})).toEqual(['dispatch'])
    expect(
      reusableDispatchJob?.steps?.some(step => step.run?.includes('harness-session-dispatch')),
    ).toBe(true)

    expect(escalateJob?.permissions).toEqual({
      actions: 'read',
      issues: 'write',
    })
    expect(escalateJob?.env?.['GH_TOKEN']).toBeUndefined()
    expect(escalationSourceStateStep?.env?.['GH_TOKEN']).toBe('${{ secrets.GITHUB_TOKEN }}')
    expect(escalationIssueStep?.if).toBe("steps.source-state.outputs.current == 'true'")
    expect(escalationIssueStep?.env?.['GH_TOKEN']).toBe('${{ github.token }}')

    // The pipeline never polls a dispatched Harness session to completion, so escalation always
    // means the pipeline broke before an agent was assigned, not that a fix attempt failed.
    expect(escalationIssueStep?.run).toContain('auto-fix could not be dispatched')
    expect(escalationIssueStep?.run).not.toContain('auto-fix could not complete')
    expect(escalationIssueStep?.run).toContain('**Failed job:**')
    expect(escalateJob?.env).toMatchObject({
      DISPATCH_RESULT: '${{ needs.dispatch.result }}',
      RENDER_PROMPT_RESULT: '${{ needs.render-prompt.result }}',
    })
    expect(escalationIssueStep?.run).toContain('$RENDER_PROMPT_RESULT')
    expect(escalationIssueStep?.run).toContain('$DISPATCH_RESULT')
  })

  it('revalidates the source run before transient classification and any automatic rerun in triage-and-rerun', () => {
    const triageJob = parsedMain.jobs?.['triage-and-rerun']
    const sourceStateStep = triageJob?.steps?.find(s => s.id === 'source-state')
    const decideStep = triageJob?.steps?.find(s => s.id === 'decide')
    const targetedRerunStep = triageJob?.steps?.find(
      s => s.name === 'Rerun targeted job on transient match',
    )
    const workflowRerunStep = triageJob?.steps?.find(
      s => s.name === 'Rerun workflow on transient match',
    )
    const triageStep = triageJob?.steps?.find(s => s.id === 'triage')

    const stepIds = triageJob?.steps?.map(s => s.id).filter(Boolean)
    expect(stepIds?.indexOf('source-state')).toBeLessThan(stepIds?.indexOf('decide') ?? -1)

    expect(sourceStateStep?.if).toBeUndefined()
    expect(sourceStateStep?.run).toBe('node ci/source-run-state.mts')
    expect(sourceStateStep?.env).toMatchObject({
      SOURCE_RUN_ATTEMPT: '${{ github.event.workflow_run.run_attempt }}',
      SOURCE_RUN_CONCLUSION: '${{ github.event.workflow_run.conclusion }}',
      SOURCE_RUN_ID: '${{ github.event.workflow_run.id }}',
    })
    expect(decideStep?.if).toBe("steps.source-state.outputs.current == 'true'")
    expect(targetedRerunStep?.if).toBe(
      "steps.source-state.outputs.current == 'true' && steps.decide.outputs.decision == 'rerun' && steps.decide.outputs.rerun_job_id != ''",
    )
    expect(workflowRerunStep?.if).toBe(
      "steps.source-state.outputs.current == 'true' && steps.decide.outputs.decision == 'rerun' && steps.decide.outputs.rerun_job_id == ''",
    )

    // Duplicate-rerun protection against the monitored workflow comes from the live
    // source-state.outputs.current check above, not from Fix Main's own attempt number: a
    // reran Fix Main attempt (issued by fix-main-self-retry.yml for Fix Main's own transient
    // failure) must still be able to rerun the monitored workflow it was classifying.
    expect(targetedRerunStep?.if).not.toContain('run_attempt')
    expect(workflowRerunStep?.if).not.toContain('run_attempt')

    // A stale source run must also be unable to set should_dispatch=true.
    expect(triageStep?.run).toContain('"${{ steps.source-state.outputs.current }}" == "true"')
  })

  it('keeps the no-checkout revalidation guard identical across every no-checkout job', () => {
    // The exact shell content (including the 48h age bound) is locked byte-for-byte against the
    // shared ci/source-run-guard-shell.mts constant in ci/source-run-guard-shell.test.mts, which
    // also verifies that constant is generated from MAX_SOURCE_RUN_AGE_MS. This test owns the
    // structural invariant that gave rise to the fix: these jobs must have no checkout, so they
    // cannot silently fall back to calling ci/source-run-state.mts directly (which errors with no
    // checkout, as revalidate-existing-pr's guard used to before this convergence).
    const sourceStateSteps = NO_CHECKOUT_SOURCE_STATE_JOBS.map(jobName => {
      const job = parsedMain.jobs?.[jobName]
      expect(job?.steps?.some(s => s.uses?.startsWith('actions/checkout'))).toBe(false)
      expect(job?.steps?.some(s => s.uses?.startsWith('./.github/actions/'))).toBe(false)
      return job?.steps?.find(s => s.id === 'source-state')
    })

    for (const step of sourceStateSteps) {
      expect(step?.run).not.toContain('node ci/source-run-state.mts')
      expect(step?.run).toContain('gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN_ID"')
      expect(step?.run).toContain('fail_closed')
      expect(step?.run).toContain('suppress_stale')
    }
  })

  it('classifies its own downstream job failures before escalating', () => {
    const classifyJob = parsedMain.jobs?.['classify-self-failure']
    const escalateJob = parsedMain.jobs?.['escalate']

    expect(classifyJob).toBeDefined()
    expect(classifyJob?.needs).toEqual(
      expect.arrayContaining([
        'triage-and-rerun',
        'related-candidates',
        'render-prompt',
        'dispatch',
      ]),
    )
    for (const condition of [classifyJob?.if, escalateJob?.if]) {
      expect(condition).toContain('always()')
      expect(condition).toContain("needs.triage-and-rerun.result == 'success'")
      expect(condition).toContain("needs.triage-and-rerun.outputs.should_dispatch == 'true'")
      expect(condition).toContain("needs.dispatch.result == 'cancelled'")
    }
    // Escalation no longer gates on related-candidates (it's best-effort context, not a dispatch
    // precondition); only the self-failure classifier still watches it, since a related-candidates
    // failure is exactly the kind of transient hiccup worth retrying instead of escalating.
    expect(classifyJob?.if).toContain("needs.related-candidates.result == 'failure'")
    expect(classifyJob?.if).toContain("needs.related-candidates.result == 'cancelled'")
    expect(escalateJob?.if).not.toContain('related-candidates.result')
    expect(classifyJob?.if).not.toContain('classify-self-failure')

    const decideStep = classifyJob?.steps?.find(s => s.id === 'decide')
    expect(decideStep?.run).toContain('node ci/transient-retry/decide.mts')
    expect(decideStep?.env).toMatchObject({
      CONCLUSION: 'failure',
      RUN_ATTEMPT: '${{ github.run_attempt }}',
      WORKFLOW_NAME: '${{ github.workflow }}',
      WORKFLOW_RUN_ID: '${{ github.run_id }}',
    })

    const retryPendingStep = classifyJob?.steps?.find(s => s.id === 'retry-pending')
    expect(retryPendingStep?.run).toContain('retry_pending=true')
    expect(retryPendingStep?.run).toContain('retry_pending=false')
    expect(retryPendingStep?.run).toContain('-lt 3')
    expect(classifyJob?.outputs?.['retry_pending']).toContain(
      'steps.retry-pending.outputs.retry_pending',
    )

    expect(escalateJob?.needs).toContain('classify-self-failure')
    expect(escalateJob?.if).toContain("needs.classify-self-failure.outputs.retry_pending != 'true'")
  })
})
