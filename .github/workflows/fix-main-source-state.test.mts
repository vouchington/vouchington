import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

import { SOURCE_RUN_GUARD_JOB_NAMES } from '../../ci/source-run-guard-shell.mts'
import { fixMain, parsedMain } from '../test-helpers/fix-main.fixtures.mts'

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

    expect(escalateJob?.permissions).toEqual({
      actions: 'read',
      contents: 'read',
      issues: 'write',
    })
    expect(escalateJob?.env?.['GH_TOKEN']).toBeUndefined()
    expect(escalationSourceStateStep?.env?.['GH_TOKEN']).toBe('${{ secrets.GITHUB_TOKEN }}')
    expect(escalationIssueStep?.if).toBe("steps.source-state.outputs.current == 'true'")
    expect(escalationIssueStep?.env?.['GH_TOKEN']).toBe('${{ github.token }}')

    // The pipeline never polls a dispatched Harness session to completion, so escalation always
    // means the pipeline broke before an agent was assigned, not that a fix attempt failed.
    expect(readFileSync('ci/automation-inline/fix-main-escalate.sh', 'utf8')).toContain(
      'auto-fix could not be dispatched',
    )
    expect(readFileSync('ci/automation-inline/fix-main-escalate.sh', 'utf8')).not.toContain(
      'auto-fix could not complete',
    )
    expect(readFileSync('ci/automation-inline/fix-main-escalate.sh', 'utf8')).toContain(
      '**Failed job:**',
    )
    expect(escalateJob?.env).toMatchObject({
      DISPATCH_RESULT: '${{ needs.dispatch.result }}',
      RENDER_PROMPT_RESULT: '${{ needs.render-prompt.result }}',
    })
    expect(readFileSync('ci/automation-inline/fix-main-escalate.sh', 'utf8')).toContain(
      '$RENDER_PROMPT_RESULT',
    )
    expect(readFileSync('ci/automation-inline/fix-main-escalate.sh', 'utf8')).toContain(
      '$DISPATCH_RESULT',
    )
  })

  it('revalidates the source run before transient classification and any automatic rerun in triage-and-rerun', () => {
    const triageJob = parsedMain.jobs?.['triage-and-rerun']
    const sourceStateStep = triageJob?.steps?.find(s => s.id === 'source-state')
    const decideStep = triageJob?.steps?.find(s => s.id === 'decide')
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
    expect(workflowRerunStep?.if).toBe(
      "steps.source-state.outputs.current == 'true' && steps.decide.outputs.decision == 'rerun'",
    )

    // Duplicate-rerun protection against the monitored workflow comes from the live
    // source-state.outputs.current check above, not from Fix Main's own attempt number: a
    // reran Fix Main attempt (issued by fix-main-self-retry.yml for Fix Main's own transient
    // failure) must still be able to rerun the monitored workflow it was classifying.
    expect(workflowRerunStep?.if).not.toContain('run_attempt')

    // A stale source run must also be unable to set should_dispatch=true.
    expect(triageStep?.env?.['SOURCE_CURRENT']).toBe('${{ steps.source-state.outputs.current }}')
    expect(readFileSync('ci/automation-inline/fix-main-dispatch-decision.sh', 'utf8')).toContain(
      '"$SOURCE_CURRENT" == "true"',
    )
  })

  it('uses the checked-out guard from a trusted workflow revision', () => {
    for (const jobName of NO_CHECKOUT_SOURCE_STATE_JOBS) {
      const job = parsedMain.jobs?.[jobName]
      const checkout = job?.steps?.find(s => s.uses?.startsWith('actions/checkout@'))
      expect(checkout?.with).toMatchObject({
        ref: '${{ github.sha }}',
        'persist-credentials': false,
      })
      const guard = job?.steps?.find(s => s.id === 'source-state')
      expect(guard?.run).toContain('ci/automation-inline/source-run-guard.sh')
      expect(job?.steps?.indexOf(checkout!)).toBeLessThan(job?.steps?.indexOf(guard!) ?? -1)
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
    expect(readFileSync('ci/automation-inline/fix-main-retry-pending.sh', 'utf8')).toContain(
      'retry_pending=true',
    )
    expect(readFileSync('ci/automation-inline/fix-main-retry-pending.sh', 'utf8')).toContain(
      'retry_pending=false',
    )
    expect(readFileSync('ci/automation-inline/fix-main-retry-pending.sh', 'utf8')).toContain(
      '-lt 3',
    )
    expect(classifyJob?.outputs?.['retry_pending']).toContain(
      'steps.retry-pending.outputs.retry_pending',
    )

    expect(escalateJob?.needs).toContain('classify-self-failure')
    expect(escalateJob?.if).toContain("needs.classify-self-failure.outputs.retry_pending != 'true'")
  })
})
