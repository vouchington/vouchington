import { describe, expect, it } from 'vitest'

import {
  assertNoWorkflowViolations,
  assertShellSnippetsInOrder,
  assertWorkflowInvariant,
  pushTriggerBranches,
  pushTriggerBranchesIgnored,
  requiredNamedStep,
  requiredStepIf,
  requiredStepRun,
  shellLogicalLines,
  workflowHasMainPushTrigger,
  workflowHasTrigger,
  workflowPushMatchesBranch,
  workflowRunSubscriptions,
  workflowTriggerNames,
  type WorkflowJob,
} from '../test-helpers/workflow-test-helpers.mts'

describe('workflow test helpers', () => {
  it('reports workflow invariant failures with their supplied context', () => {
    expect(() => assertWorkflowInvariant(false, 'job "build" has no runner')).toThrowError(
      'job "build" has no runner',
    )
    expect(() => assertWorkflowInvariant(true, 'not emitted')).not.toThrow()
  })

  it('reports every workflow violation under an optional heading', () => {
    expect(() =>
      assertNoWorkflowViolations(
        ['build.yml#test: missing timeout', 'deploy.yml#apply: missing permissions'],
        'Workflow policy violations:',
      ),
    ).toThrowError(
      'Workflow policy violations:\nbuild.yml#test: missing timeout\ndeploy.yml#apply: missing permissions',
    )
    expect(() => assertNoWorkflowViolations(['build.yml#test: missing timeout'])).toThrowError(
      'build.yml#test: missing timeout',
    )
    expect(() => assertNoWorkflowViolations([], 'not emitted')).not.toThrow()
  })

  it('finds required named steps and reports missing steps clearly', () => {
    const job: WorkflowJob = {
      steps: [{ name: 'Prepare' }, { name: 'Run checks' }],
    }

    expect(requiredNamedStep(job, 'Run checks')).toEqual({ name: 'Run checks' })
    expect(() => requiredNamedStep(undefined, 'Publish')).toThrow(
      'Cannot find step "Publish" because the job is undefined',
    )
    expect(() => requiredNamedStep({}, 'Publish')).toThrow(
      'Cannot find step "Publish" because the job has no steps',
    )
    expect(() => requiredNamedStep(job, 'Publish')).toThrow('Missing workflow step: Publish')
  })

  it('requires step if expressions and run scripts', () => {
    const step = {
      name: 'Guarded script',
      if: "steps.prepare.outcome == 'success'",
      run: 'echo ok',
    }

    expect(requiredStepIf(step)).toBe("steps.prepare.outcome == 'success'")
    expect(requiredStepRun(step)).toBe('echo ok')
    expect(requiredStepIf({ name: 'Disabled step', if: false })).toBe(false)
    expect(requiredStepIf({ name: 'Enabled step', if: true })).toBe(true)
    expect(() => requiredStepIf({ name: 'Unguarded' })).toThrow(
      'Missing if expression for workflow step: Unguarded',
    )
    expect(() => requiredStepRun({ id: 'noop' })).toThrow(
      'Missing run script for workflow step: noop',
    )
  })

  it('joins shell logical lines only on unescaped trailing backslashes', () => {
    const script = [
      'aws ecs run-task \\',
      '  --cluster voucha-staging-cluster',
      'printf "%s\\\\" "$path"',
      'echo done',
    ].join('\n')

    expect(shellLogicalLines(script)).toEqual([
      'aws ecs run-task    --cluster voucha-staging-cluster',
      'printf "%s\\\\" "$path"',
      'echo done',
    ])
  })

  it('normalizes workflow trigger names across scalar, array, and mapping triggers', () => {
    expect(workflowTriggerNames('workflow_call')).toEqual(['workflow_call'])
    expect(workflowTriggerNames(['push', 'workflow_call'])).toEqual(['push', 'workflow_call'])
    expect(workflowTriggerNames({ push: null, workflow_run: { workflows: ['CI'] } })).toEqual([
      'push',
      'workflow_run',
    ])
    expect(workflowHasTrigger(['push', 'workflow_call'], 'workflow_call')).toBe(true)
    expect(workflowHasTrigger({ push: null }, 'workflow_call')).toBe(false)
  })

  it('extracts push branches and ignores branches from mapping triggers', () => {
    expect(pushTriggerBranches({ branches: 'main' })).toEqual(['main'])
    expect(pushTriggerBranches({ branches: ['main', 'release'] })).toEqual(['main', 'release'])
    expect(pushTriggerBranches({ 'branches-ignore': ['main'] })).toEqual([])
    expect(pushTriggerBranchesIgnored({ 'branches-ignore': 'release' })).toEqual(['release'])
    expect(pushTriggerBranchesIgnored({ branches: ['main'] })).toEqual([])
  })

  it('detects main push triggers and workflow_run subscriptions', () => {
    expect(workflowHasMainPushTrigger({ on: 'push' })).toBe(true)
    expect(workflowHasMainPushTrigger({ on: ['pull_request', 'push'] })).toBe(true)
    expect(workflowHasMainPushTrigger({ on: { push: null } })).toBe(true)
    expect(workflowHasMainPushTrigger({ on: { push: { branches: ['main'] } } })).toBe(true)
    expect(workflowHasMainPushTrigger({ on: { push: { branches: ['release'] } } })).toBe(false)
    expect(workflowHasMainPushTrigger({ on: { push: { 'branches-ignore': ['main'] } } })).toBe(
      false,
    )
    expect(workflowHasMainPushTrigger({ on: { push: { 'branches-ignore': ['release'] } } })).toBe(
      true,
    )
    expect(workflowPushMatchesBranch({ on: { push: { branches: ['release'] } } }, 'release')).toBe(
      true,
    )
    expect(
      workflowPushMatchesBranch({ on: { push: { branches: ['release/**'] } } }, 'release/2026'),
    ).toBe(true)
    expect(
      workflowPushMatchesBranch(
        { on: { push: { branches: ['release/**', '!release/archive/**'] } } },
        'release/archive/2025',
      ),
    ).toBe(false)
    expect(
      workflowPushMatchesBranch(
        {
          on: {
            push: {
              branches: ['release/**'],
              'branches-ignore': ['release/archive/**'],
            },
          },
        },
        'release/archive/2025',
      ),
    ).toBe(false)
    expect(
      workflowPushMatchesBranch({ on: { push: { 'branches-ignore': ['release'] } } }, 'release'),
    ).toBe(false)
    expect(
      workflowPushMatchesBranch(
        { on: { push: { 'branches-ignore': ['release/archive/**'] } } },
        'release/archive/2025',
      ),
    ).toBe(false)
    expect(
      workflowPushMatchesBranch(
        { on: { push: { 'branches-ignore': ['release/**', '!release/2026/**'] } } },
        'release/2026/preview',
      ),
    ).toBe(true)
    expect(
      workflowPushMatchesBranch(
        { on: { push: { 'branches-ignore': ['release/**'], 'tags-ignore': ['v*'] } } },
        'main',
      ),
    ).toBe(true)
    expect(workflowPushMatchesBranch({ on: { push: { tags: ['v*'] } } }, 'main')).toBe(false)
    expect(workflowPushMatchesBranch({ on: { push: { 'tags-ignore': ['v*'] } } }, 'main')).toBe(
      false,
    )
    expect(workflowHasMainPushTrigger({ on: { workflow_run: { workflows: ['CI'] } } })).toBe(false)

    expect(workflowRunSubscriptions({ workflow_run: null })).toEqual([])
    expect(workflowRunSubscriptions({ workflow_run: { workflows: 'CI' } })).toEqual(['CI'])
    expect(
      workflowRunSubscriptions({
        workflow_run: { workflows: ['Actionlint', 'Gitleaks'] },
      }),
    ).toEqual(['Actionlint', 'Gitleaks'])
    expect(workflowRunSubscriptions(['push', 'workflow_run'])).toEqual([])
  })

  it('asserts shell snippets in logical-line order', () => {
    const script = [
      'aws ecs run-task \\',
      '  --cluster voucha-staging-cluster',
      'echo "reset_stopped_cleanly=false" >> "$GITHUB_OUTPUT"',
      'wait_for_reset_task_stopped 690',
      'echo "reset_stopped_cleanly=true" >> "$GITHUB_OUTPUT"',
    ].join('\n')

    expect(() =>
      assertShellSnippetsInOrder(script, [
        'aws ecs run-task',
        'reset_stopped_cleanly=false',
        'wait_for_reset_task_stopped 690',
        'reset_stopped_cleanly=true',
      ]),
    ).not.toThrow()
    expect(() =>
      assertShellSnippetsInOrder(script, [
        'reset_stopped_cleanly=true',
        'wait_for_reset_task_stopped 690',
      ]),
    ).toThrow('Remaining script search context:')
  })
})
