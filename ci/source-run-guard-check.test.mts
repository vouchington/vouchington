import { describe, expect, it } from 'vitest'

import {
  SOURCE_RUN_EXEMPTIONS,
  SOURCE_RUN_WORKFLOWS,
  type SourceRunExemption,
  type WorkflowLike,
} from './source-run-guard-inventory.mts'
import {
  checkSourceRunGuardTotality,
  classifySourceRunSite,
  type SourceRunSiteDisposition,
} from './source-run-guard-check.mts'
import { SOURCE_RUN_GUARD_SHELL } from './source-run-guard-shell.mts'

const EXPECTED_DISPOSITIONS: Array<{
  workflow: string
  job: string
  disposition: SourceRunSiteDisposition
}> = [
  { workflow: 'fix-main.yml', job: 'triage-and-rerun', disposition: 'guarded' },
  { workflow: 'fix-main.yml', job: 'related-candidates', disposition: 'exempt' },
  { workflow: 'fix-main.yml', job: 'render-prompt', disposition: 'guarded' },
  { workflow: 'fix-main.yml', job: 'dispatch', disposition: 'gated' },
  { workflow: 'fix-main.yml', job: 'escalate', disposition: 'guarded' },
  { workflow: 'fix-main-self-retry.yml', job: 'retry', disposition: 'guarded' },
  { workflow: 'fix-dependabot.yml', job: 'triage-and-rerun', disposition: 'guarded' },
  { workflow: 'fix-dependabot.yml', job: 'render-prompt', disposition: 'guarded' },
  { workflow: 'fix-dependabot.yml', job: 'revalidate-dispatch', disposition: 'guarded' },
  { workflow: 'fix-dependabot.yml', job: 'dispatch', disposition: 'gated' },
  { workflow: 'fix-dependabot.yml', job: 'escalate', disposition: 'guarded' },
]

describe('classifySourceRunSite', () => {
  it.each(EXPECTED_DISPOSITIONS)(
    '$workflow/$job is $disposition',
    ({ workflow, job, disposition }) => {
      expect(
        classifySourceRunSite(SOURCE_RUN_WORKFLOWS, SOURCE_RUN_EXEMPTIONS, { workflow, job }),
      ).toBe(disposition)
    },
  )

  it('treats a job with no if condition at all as unguarded absent a guard step or exemption', () => {
    const workflows: Record<string, WorkflowLike> = {
      'synthetic.yml': { jobs: { 'no-if-job': {} } },
    }
    expect(
      classifySourceRunSite(workflows, [], { workflow: 'synthetic.yml', job: 'no-if-job' }),
    ).toBe('unguarded')
  })

  it('treats a guard step with an if condition as unguarded, since it can be skipped', () => {
    const workflows: Record<string, WorkflowLike> = {
      'synthetic.yml': {
        jobs: {
          'conditional-guard': {
            steps: [
              { id: 'source-state', if: "vars.SOMETHING == 'true'", run: SOURCE_RUN_GUARD_SHELL },
            ],
          },
        },
      },
    }
    expect(
      classifySourceRunSite(workflows, [], { workflow: 'synthetic.yml', job: 'conditional-guard' }),
    ).toBe('unguarded')
  })

  it('treats a downstream job gating on a conditionally-guarded upstream as unguarded too', () => {
    const workflows: Record<string, WorkflowLike> = {
      'synthetic.yml': {
        jobs: {
          'conditional-guard': {
            steps: [
              { id: 'source-state', if: "vars.SOMETHING == 'true'", run: SOURCE_RUN_GUARD_SHELL },
            ],
          },
          downstream: { if: "needs.conditional-guard.outputs.current == 'true'" },
        },
      },
    }
    expect(
      classifySourceRunSite(workflows, [], { workflow: 'synthetic.yml', job: 'downstream' }),
    ).toBe('unguarded')
  })

  it('treats a guard step with incidental surrounding whitespace as guarded', () => {
    const workflows: Record<string, WorkflowLike> = {
      'synthetic.yml': {
        jobs: {
          'whitespace-guard': {
            steps: [{ id: 'source-state', run: `\n${SOURCE_RUN_GUARD_SHELL}\n` }],
          },
        },
      },
    }
    expect(
      classifySourceRunSite(workflows, [], { workflow: 'synthetic.yml', job: 'whitespace-guard' }),
    ).toBe('guarded')
  })

  it('does not treat a gate on an upstream that is itself only gated as guarding', () => {
    const workflows: Record<string, WorkflowLike> = {
      'synthetic.yml': {
        jobs: {
          root: { if: "needs.unrelated.outputs.current == 'true'" },
          middle: { if: "needs.root.outputs.current == 'true'" },
          leaf: { if: "needs.middle.outputs.current == 'true'" },
        },
      },
    }
    expect(classifySourceRunSite(workflows, [], { workflow: 'synthetic.yml', job: 'leaf' })).toBe(
      'unguarded',
    )
  })
})

describe('checkSourceRunGuardTotality', () => {
  it('finds no unguarded sites and no orphaned exemptions against the real workflows', () => {
    expect(checkSourceRunGuardTotality()).toEqual({ unguardedSites: [], orphanedExemptions: [] })
  })

  it('flags a newly added workflow_run job with no guard, gate, or exemption', () => {
    const workflows: Record<string, WorkflowLike> = {
      'dispatch-completed-deploy.yml': SOURCE_RUN_WORKFLOWS[
        'dispatch-completed-deploy.yml'
      ] as WorkflowLike,
      'fix-main.yml': {
        jobs: {
          ...SOURCE_RUN_WORKFLOWS['fix-main.yml']?.jobs,
          'rogue-job': { if: "github.event.workflow_run.conclusion == 'success'" },
        },
      },
      'fix-main-self-retry.yml': SOURCE_RUN_WORKFLOWS['fix-main-self-retry.yml'] as WorkflowLike,
      'fix-dependabot.yml': SOURCE_RUN_WORKFLOWS['fix-dependabot.yml'] as WorkflowLike,
    }
    const result = checkSourceRunGuardTotality(workflows, SOURCE_RUN_EXEMPTIONS)
    expect(result.unguardedSites).toContainEqual({ workflow: 'fix-main.yml', job: 'rogue-job' })
    expect(result.orphanedExemptions).toEqual([])
  })

  it('flags a declared exemption whose job was renamed or removed', () => {
    const staleExemption: SourceRunExemption = {
      workflow: 'fix-main.yml',
      job: 'renamed-or-deleted-job',
      reason: 'stale fixture entry for this test',
    }
    const result = checkSourceRunGuardTotality(SOURCE_RUN_WORKFLOWS, [
      ...SOURCE_RUN_EXEMPTIONS,
      staleExemption,
    ])
    expect(result.orphanedExemptions).toEqual([staleExemption])
    expect(result.unguardedSites).toEqual([])
  })
})
