import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { workflowHasMainPushTrigger, workflowRunSubscriptions } from './workflow-test-helpers.mts'
import {
  fixMain,
  fixMainPrompt,
  parsedDispatch,
  parsedMain,
  renderCodexFixMainPrompt,
} from './fix-main.test-helpers.mts'

type Workflow = {
  name?: string
  on?: unknown
}

const workflowDir = '.github/workflows'
const recoveryOnlyWorkflowNames = ['Dispatch completed deploy']
const workflowPaths = readdirSync(workflowDir).flatMap(file =>
  file.endsWith('.yml') || file.endsWith('.yaml') ? [join(workflowDir, file)] : [],
)

function readWorkflow(path: string): Workflow {
  return load(readFileSync(path, 'utf8')) as Workflow
}

function mainPushWorkflowNames(): string[] {
  return workflowPaths.flatMap(path => {
    const workflow = readWorkflow(path)
    if (!workflowHasMainPushTrigger(workflow) || !workflow.name) return []
    return [workflow.name]
  })
}

describe('fix-main workflow', () => {
  it('subscribes to main push workflows and the completed-deploy dispatcher', () => {
    const on = load(fixMain) as Workflow
    const subscribed = workflowRunSubscriptions(on.on)
    const expected = [...mainPushWorkflowNames(), ...recoveryOnlyWorkflowNames]

    expect(expected.length).toBeGreaterThan(0)
    expect([...subscribed].sort()).toEqual([...expected].sort())
  })

  it('finds related open PRs or issues before dispatching, without gating on them', () => {
    const relatedJob = parsedMain.jobs?.['related-candidates']

    expect(relatedJob).toBeDefined()
    expect(relatedJob?.['runs-on']).toEqual(['self-hosted'])
    expect(relatedJob?.needs).toContain('triage-and-rerun')
    expect(relatedJob?.if).toBe("needs.triage-and-rerun.outputs.should_dispatch == 'true'")
    expect(relatedJob?.if).not.toContain("github.event.workflow_run.event == 'push'")

    const promptContextSteps =
      relatedJob?.steps?.filter(s => s.uses?.includes('harness-prompt-context')) ?? []
    const promptContextStep = promptContextSteps.find(s => s.id === 'prompt-context')
    expect(promptContextSteps).toHaveLength(1)
    expect(promptContextStep?.with?.['related-title-key']).toContain('Automation fix:')
    expect(promptContextStep?.with?.['related-title-key']).toContain(
      'github.event.workflow_run.name',
    )
    expect(promptContextStep?.with?.['related-extra-labels']).toBe('')
    expect(promptContextStep?.with?.['check-prs']).toBe('true')
    expect(promptContextStep?.with?.['check-issues']).toBe('true')
    expect(relatedJob?.outputs).not.toHaveProperty('skip')

    const renderJob = parsedMain.jobs?.['render-prompt']
    expect(renderJob?.if).not.toContain('.outputs.skip')
    const dispatchJob = parsedMain.jobs?.['dispatch']
    expect(dispatchJob?.if).not.toContain('.outputs.skip')

    const triageJob = parsedMain.jobs?.['triage-and-rerun']
    expect(triageJob?.needs).toBeUndefined()
    expect(triageJob?.if).toContain("github.event.workflow_run.event == 'push'")
    expect(triageJob?.if).toContain("github.event.workflow_run.event == 'workflow_run'")
    expect(triageJob?.if).toContain("github.event.workflow_run.name == 'Dispatch completed deploy'")
    expect(triageJob?.if).toContain("github.event.workflow_run.head_branch == 'main'")
    expect(triageJob?.if).toContain('failure')
    expect(triageJob?.if).toContain('timed_out')
    expect(triageJob?.if).toContain('cancelled')
  })

  it('lets related-candidates fail or yield no output without blocking dispatch or escalation', () => {
    const dispatchJob = parsedMain.jobs?.['dispatch']
    const renderStep = parsedMain.jobs?.['render-prompt']?.steps?.find(s => s.id === 'render')
    const escalateJob = parsedMain.jobs?.['escalate']

    expect(dispatchJob?.if).toContain('!cancelled()')
    // A render-prompt failure can still leave source-current='true' (that output is set by an
    // earlier step than the one that failed), so dispatch must require render-prompt's own
    // success explicitly rather than relying on source-current alone — otherwise it would send
    // an empty prompt to the reusable dispatcher instead of skipping in favor of escalation.
    expect(dispatchJob?.if).toContain("needs.render-prompt.result == 'success'")
    expect(renderStep?.with?.['vars']).toContain(
      "needs.related-candidates.outputs.related-candidates || '[]'",
    )
    expect(dispatchJob?.with?.['publish-related-candidates']).toBe(
      "${{ needs.related-candidates.outputs.related-candidates || '[]' }}",
    )
    expect(escalateJob?.if).not.toContain('related-candidates.result')
    expect(escalateJob?.if).toContain("needs.render-prompt.result == 'failure'")
    expect(escalateJob?.if).toContain("needs.render-prompt.result == 'cancelled'")
    expect(escalateJob?.if).toContain("needs.dispatch.result == 'failure'")
    expect(escalateJob?.if).toContain("needs.dispatch.result == 'cancelled'")
  })

  it('passes broader related candidates into the main automation prompt', () => {
    const relatedJob = parsedMain.jobs?.['related-candidates']
    const promptContextStep = relatedJob?.steps?.find(s => s.id === 'prompt-context')
    const renderJob = parsedMain.jobs?.['render-prompt']
    const renderStep = renderJob?.steps?.find(s => s.id === 'render')

    expect(relatedJob?.outputs?.['related-candidates']).toContain(
      'steps.prompt-context.outputs.related-candidates',
    )
    expect(promptContextStep?.with?.['related-title-key']).toContain('Automation fix:')
    expect(promptContextStep?.with?.['related-title-key']).toContain(
      'github.event.workflow_run.name',
    )
    expect(renderStep?.with?.['vars']).toContain(
      'needs.related-candidates.outputs.related-candidates',
    )
    expect(renderStep?.uses).toContain('jonathanong/auto-harness/actions/harness-render-prompt@')
  })

  it('renders related candidate metadata alongside replacement instructions', () => {
    const relatedCandidates = JSON.stringify([
      {
        headRefName: 'codex/ci-fix',
        headRepoOwner: 'jongleberry',
        isCrossRepository: false,
        kind: 'pr',
        labels: ['automation'],
        number: 201,
        title: 'Automation fix: CI @ oldsha',
        url: 'https://github.com/jonathanong/filaments/pull/201',
      },
      {
        headRefName: 'patch-1',
        headRepoOwner: 'outside-contributor',
        isCrossRepository: true,
        kind: 'pr',
        labels: ['automation', 'needs-human'],
        number: 202,
        title: 'Automation fix: CI @ forksha',
        url: 'https://github.com/jonathanong/filaments/pull/202',
      },
      {
        headRefName: null,
        kind: 'issue',
        labels: ['automation', 'workflow'],
        number: 402,
        title: 'Automation options: CI failure',
        url: 'https://github.com/jonathanong/filaments/issues/402',
      },
    ])

    const rendered = renderCodexFixMainPrompt(relatedCandidates)

    expect(rendered).toContain('"number":201')
    expect(rendered).toContain('"headRefName":"codex/ci-fix"')
    expect(rendered).toContain('"headRepoOwner":"outside-contributor"')
    expect(rendered).toContain('"isCrossRepository":true')
    expect(rendered).toContain('"labels":["automation","workflow"]')
    expect(rendered).toContain('Automation options: CI failure')
  })

  it('binds only the Harness credential to the active dispatcher', () => {
    const dispatchJob = parsedMain.jobs?.['dispatch']

    expect(dispatchJob?.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
    expect(Object.keys(parsedDispatch.jobs ?? {})).toEqual(['dispatch'])
    expect(JSON.stringify(parsedDispatch.jobs)).not.toContain('AUTOMATION_GITHUB_TOKEN')

    const triageJob = parsedMain.jobs?.['triage-and-rerun']
    const decideStep = triageJob?.steps?.find(s => s.id === 'decide')
    expect(decideStep?.env?.['GH_TOKEN']).toBe('${{ secrets.GITHUB_TOKEN }}')
  })

  it('isolates Harness concurrency by source workflow and failing commit', () => {
    const concurrencyId = parsedMain.jobs?.dispatch?.with?.['concurrency-id']

    expect(concurrencyId).toContain('github.event.workflow_run.workflow_id')
    expect(concurrencyId).toContain('github.event.workflow_run.head_sha')
    expect(concurrencyId).not.toContain('github.workflow }}')
    const resolve = (workflowId: number, sha: string) => `filaments:fix-main:${workflowId}:${sha}`
    expect(resolve(101, 'same-sha')).not.toBe(resolve(202, 'same-sha'))
  })

  it('grants checks read access for transient retry annotation triage', () => {
    expect(parsedMain.permissions).toEqual({ contents: 'read' })
    expect(parsedMain.jobs?.['triage-and-rerun']?.permissions).toMatchObject({
      actions: 'write',
      checks: 'read',
      contents: 'read',
    })
  })

  it('triage-and-rerun job uses extensible transient-retry rule catalogue', () => {
    const triageJob = parsedMain.jobs?.['triage-and-rerun']

    const decideStep = triageJob?.steps?.find(s => s.id === 'decide')
    expect(decideStep).toBeDefined()
    expect(decideStep?.run).toContain('node ci/transient-retry/decide.mts')

    const targetedRerunStep = triageJob?.steps?.find(
      s => s.name === 'Rerun targeted job on transient match',
    )
    const workflowRerunStep = triageJob?.steps?.find(
      s => s.name === 'Rerun workflow on transient match',
    )
    expect(targetedRerunStep?.if).toBe(
      "steps.source-state.outputs.current == 'true' && steps.decide.outputs.decision == 'rerun' && steps.decide.outputs.rerun_job_id != ''",
    )
    expect(targetedRerunStep?.run).toContain(
      'gh run rerun --repo "$GITHUB_REPOSITORY" --job "${{ steps.decide.outputs.rerun_job_id }}"',
    )
    expect(workflowRerunStep?.if).toBe(
      "steps.source-state.outputs.current == 'true' && steps.decide.outputs.decision == 'rerun' && steps.decide.outputs.rerun_job_id == ''",
    )
    expect(workflowRerunStep?.run).toContain(
      'gh run rerun --repo "$GITHUB_REPOSITORY" "$WORKFLOW_RUN_ID"',
    )

    // Duplicate-rerun protection against the monitored workflow comes from the live
    // source-state.outputs.current check above, not from Fix Main's own attempt number: a
    // reran Fix Main attempt (issued by fix-main-self-retry.yml for Fix Main's own transient
    // failure) must still be able to rerun the monitored workflow it was classifying.
    expect(targetedRerunStep?.if).not.toContain('run_attempt')
    expect(workflowRerunStep?.if).not.toContain('run_attempt')

    const triageStep = triageJob?.steps?.find(s => s.id === 'triage')
    expect(triageStep).toBeDefined()
    expect(triageStep?.run).toContain('steps.decide.outputs.decision')
    expect(triageStep?.run).toContain('should_dispatch=true')
    expect(triageStep?.run).toContain('should_dispatch=false')

    expect(triageJob?.outputs?.['should_dispatch']).toContain(
      'steps.triage.outputs.should_dispatch',
    )
  })

  it('fix-main prompt references the transient-retry rule catalogue', () => {
    expect(fixMainPrompt).toContain('ci/transient-retry/rules.mts')
  })

  it('requires immediate and selector fixes for a Vitest PR-selection miss', () => {
    expect(fixMainPrompt).toContain('## Vitest PR-selection miss investigation')
    expect(fixMainPrompt).toContain('`select-ci`')
    expect(fixMainPrompt).toContain('`ci/vitest/ci-select.mts`')
    expect(fixMainPrompt).toContain('fix both the immediate breakage and the miss')
    expect(fixMainPrompt).toContain('expected-but-unselected test')
  })

  it('runs the immutable built-in client without caller authoring credentials', () => {
    const dispatchJob = parsedDispatch.jobs?.dispatch
    expect(
      dispatchJob?.steps?.some(step => step.run?.includes('ci/harness-session-dispatch.mts')),
    ).toBe(true)
    expect(JSON.stringify(dispatchJob)).not.toContain('AUTOMATION_GITHUB_TOKEN')
  })
})
