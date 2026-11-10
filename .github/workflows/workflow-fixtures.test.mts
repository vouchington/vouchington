import { shellLogicalLines, workflowHasTrigger } from '../../ci/workflow-shell-policy.mts'
import { describe, expect, it } from 'vitest'

import {
  assertNoWorkflowViolations,
  assertShellSnippetsInOrder,
  assertWorkflowInvariant,
  requiredNamedStep,
  requiredStepIf,
  requiredStepRun,
  type WorkflowJob,
} from '../test-helpers/workflow-fixtures.mts'

describe('workflow test helpers', () => {
  it('reports workflow invariant failures with their supplied context', () => {
    expect(() => assertWorkflowInvariant(false, 'job "build" has no runner')).toThrow(
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
    ).toThrow(
      'Workflow policy violations:\nbuild.yml#test: missing timeout\ndeploy.yml#apply: missing permissions',
    )
    expect(() => assertNoWorkflowViolations(['build.yml#test: missing timeout'])).toThrow(
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

  it('detects a workflow trigger across scalar, array, and mapping triggers', () => {
    expect(workflowHasTrigger(['push', 'workflow_call'], 'workflow_call')).toBe(true)
    expect(workflowHasTrigger({ push: null }, 'workflow_call')).toBe(false)
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
