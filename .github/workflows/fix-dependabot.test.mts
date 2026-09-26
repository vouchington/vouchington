import { describe, expect, it } from 'vitest'

import {
  parsedDependabot as parsed,
  promptText,
} from '../test-helpers/fix-dependabot.test-helpers.mts'

describe('fix-dependabot workflow', () => {
  it('keeps dependency repair validation inside the exact live branch boundary', () => {
    expect(promptText).not.toContain('codex-completion.json')
  })

  it('keeps trusted triage and prompt rendering setup outside the direct Harness dispatch', () => {
    const dispatchJob = parsed.jobs?.['dispatch']
    const triageJob = parsed.jobs?.['triage-and-rerun']
    const renderJob = parsed.jobs?.['render-prompt']
    const triageSetup = triageJob?.steps?.find(s => s.uses?.endsWith('/setup-node-pnpm'))
    const renderSetup = renderJob?.steps?.find(s => s.uses?.endsWith('/setup-node-pnpm'))

    expect(dispatchJob?.with?.['install-workspace-dependencies']).toBeUndefined()
    expect(triageSetup?.with).toBeUndefined()
    expect(renderSetup?.with).toBeUndefined()
  })

  it('checks for existing automated commits on the Dependabot branch before dispatching', () => {
    const dedupJob = parsed.jobs?.['check-duplicates']

    expect(dedupJob).toBeDefined()
    expect(dedupJob?.['runs-on']).toEqual('ubuntu-latest')
    expect(dedupJob?.needs).toContain('triage-and-rerun')
    expect(dedupJob?.if).toContain("needs.triage-and-rerun.outputs.should_dispatch == 'true'")

    // pr-commits mode: uses known PR number directly to avoid branch-name ambiguity
    const loopBreakerStep = dedupJob?.steps?.find(s => s.uses?.includes('harness-prompt-context'))
    expect(loopBreakerStep?.with?.['search-mode']).toBe('pr-commits')
    expect(loopBreakerStep?.with?.['topic-key']).toContain('triage-and-rerun.outputs.pr_number')

    // render-prompt and dispatch are gated on check-duplicates output
    const renderJob = parsed.jobs?.['render-prompt']
    expect(renderJob?.needs).toContain('check-duplicates')
    expect(renderJob?.if).toContain("needs.check-duplicates.outputs.skip != 'true'")

    const dispatchJob = parsed.jobs?.['dispatch']
    expect(dispatchJob?.needs).toContain('check-duplicates')
    expect(dispatchJob?.if).toContain("needs.check-duplicates.outputs.skip != 'true'")
  })

  it('revalidates the exact open Dependabot head before Harness dispatch', () => {
    const jobs = parsed.jobs ?? {}
    const revalidate = jobs['revalidate-dispatch']
    const sourceStateStep = revalidate?.steps?.find(s => s.id === 'source-state')
    const prStep = revalidate?.steps?.find(s => s.id === 'pr')

    const needs = ['triage-and-rerun', 'check-duplicates', 'render-prompt']
    expect(revalidate?.needs).toEqual(needs)
    expect(revalidate?.permissions).toMatchObject({ actions: 'read', 'pull-requests': 'read' })
    expect(sourceStateStep?.run).not.toContain('node ci/source-run-state.mts')
    expect(sourceStateStep?.run).toContain(
      'gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN_ID"',
    )
    expect(prStep?.if).toBe("steps.source-state.outputs.current == 'true'")
    expect(prStep?.run).toContain('.user.login == "dependabot[bot]"')
    expect(prStep?.run).toContain('.head.sha == env.EVENT_HEAD_SHA')
    expect(jobs.dispatch?.needs).toContain('revalidate-dispatch')
    expect(jobs.dispatch?.if).toContain("needs.revalidate-dispatch.outputs.current == 'true'")
    expect(jobs.escalate?.needs).toContain('revalidate-dispatch')
    expect(jobs.escalate?.if).toContain("needs.revalidate-dispatch.result == 'failure'")
  })

  it('runs from completed CI workflow_run events', () => {
    const on = parsed.on as {
      workflow_run?: { workflows?: string[]; types?: string[] }
    }

    expect(on.workflow_run?.workflows).toEqual(['CI'])
    expect(on.workflow_run?.types).toEqual(['completed'])
  })

  it('coalesces completions per Dependabot branch, not per commit', () => {
    // Dispatch checks out whatever the dependabot/* branch tip is at checkout time. Keying
    // concurrency on head_sha would let a rebase (new SHA, same
    // branch) open a fresh group and race a still-running triage for the same branch; keying on
    // head_branch serializes them instead.
    expect(parsed.concurrency?.group).toBe(
      'fix-dependabot-${{ github.event.workflow_run.head_branch }}',
    )
    expect(parsed.concurrency?.['cancel-in-progress']).toBe(false)
  })

  it('uses GitHub-supported coalescing without a non-existent FIFO key', () => {
    expect(parsed.concurrency).not.toHaveProperty('queue')
  })

  it('grants checks read permission for transient retry annotation rules', () => {
    expect(parsed.permissions).toEqual({ contents: 'read' })
    expect(parsed.jobs?.['triage-and-rerun']?.permissions).toMatchObject({
      actions: 'write',
      checks: 'read',
      contents: 'read',
    })
  })

  it('gates to same-repo failing Dependabot pull request runs', () => {
    const triageJob = parsed.jobs?.['triage-and-rerun']

    expect(triageJob?.if).toContain("github.event.workflow_run.event == 'pull_request'")
    expect(triageJob?.if).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository',
    )
    expect(triageJob?.if).toContain(
      "startsWith(github.event.workflow_run.head_branch, 'dependabot/')",
    )
    expect(triageJob?.if).toContain('failure')
    expect(triageJob?.if).toContain('timed_out')
    expect(triageJob?.if).toContain('cancelled')
  })

  it('asserts the actor is dependabot[bot] to block collaborator-branch spoofing', () => {
    const triageJob = parsed.jobs?.['triage-and-rerun']

    // A collaborator pushing a dependabot/* branch must not trigger the privileged Harness
    // dispatch.  The actor check mirrors the trusted-context logic in ci.yml.
    expect(triageJob?.if).toContain("github.event.workflow_run.actor.login == 'dependabot[bot]'")
  })

  it('keeps workflow_run event values out of shell scripts', () => {
    const runScripts = Object.values(parsed.jobs ?? {}).flatMap(
      job => job.steps?.flatMap(step => (step.run ? [step.run] : [])) ?? [],
    )

    expect(runScripts.length).toBeGreaterThan(0)
    for (const script of runScripts) {
      expect(script).not.toMatch(/\$\{\{\s*[^}]*github\.event\.workflow_run/)
    }
  })

  it('revalidates the PR head against the triggering event before dispatching Harness', () => {
    // A stale workflow_run event (superseded by a Dependabot rebase) must not be allowed to
    // dispatch Harness against a branch tip it never actually
    // tested. Compare the live headRefOid to the SHA the triggering event fired for.
    const triageJob = parsed.jobs?.['triage-and-rerun']
    const triageStep = triageJob?.steps?.find(s => s.id === 'triage')

    expect(triageStep?.env?.['EVENT_HEAD_SHA']).toContain('github.event.workflow_run.head_sha')
    expect(triageStep?.run).toContain(
      'gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --json headRefOid --jq \'.headRefOid\'',
    )
    expect(triageStep?.run).toContain('CURRENT_HEAD_SHA')
    expect(triageStep?.run).toContain('"$CURRENT_HEAD_SHA" != "$EVENT_HEAD_SHA"')
    expect(triageStep?.run).toContain('Skipping automation: PR #$PR_NUMBER moved from')
    // gh pr view reads PR metadata via the API, which needs the pull-requests scope; without it
    // this call 403s on the hard-failure path (the one that should actually dispatch Harness) and
    // the job fails before writing should_dispatch.
    expect(triageJob?.permissions?.['pull-requests']).toBe('read')
  })

  it('dispatches Harness against the existing Dependabot branch and PR', () => {
    const dispatchJob = parsed.jobs?.['dispatch']
    const renderJob = parsed.jobs?.['render-prompt']
    const setupStep = renderJob?.steps?.find(s => s.uses?.endsWith('/setup-node-pnpm'))
    const renderStep = renderJob?.steps?.find(s => s.id === 'render')
    const sourceStateStep = renderJob?.steps?.find(s => s.id === 'source-state')

    expect(renderJob?.permissions).toMatchObject({ actions: 'read', contents: 'read' })
    expect(sourceStateStep?.run).toContain('node ci/source-run-state.mts')
    expect(renderJob?.outputs?.['source-current']).toContain('steps.source-state.outputs.current')
    expect(renderStep?.if).toBe("steps.source-state.outputs.current == 'true'")
    expect(dispatchJob?.if).toContain("needs.render-prompt.outputs.source-current == 'true'")
    expect(dispatchJob?.uses).toBe('./.github/workflows/harness-dispatch.yml')
    expect(dispatchJob?.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
    expect(dispatchJob?.with?.['agent-ref']).toBe('${{ github.event.workflow_run.head_branch }}')
    expect(dispatchJob?.with?.['expected-head-sha']).toBe(
      '${{ github.event.workflow_run.head_sha }}',
    )
    expect(dispatchJob?.with?.['pr-number']).toBeUndefined()
    expect(dispatchJob?.with?.['prompt']).toBe('${{ needs.render-prompt.outputs.prompt }}')
    expect(dispatchJob?.with?.['slack-source']).toContain('Dependabot PR')
    expect(dispatchJob?.with?.['slack-source']).toContain('Failing run')
    expect(setupStep).toBeDefined()
    expect(renderStep?.uses).toContain('jonathanong/auto-harness/actions/harness-render-prompt@')
    expect(renderStep?.with?.['template']).toBe('docs/prompts/automation/fix-dependabot.md')
    expect(promptText).not.toContain('$pr-shepherd:pr-shepherd')
    expect(promptText).toContain('## Root cause')
    expect(promptText).toContain('## Implementation choice')
    expect(promptText).toContain('## Options considered')
  })

  it('comments on the PR for immediate dispatch failures', () => {
    const escalateJob = parsed.jobs?.['escalate']
    const sourceStateStep = escalateJob?.steps?.find(s => s.id === 'source-state')
    const commentStep = escalateJob?.steps?.find(s =>
      s.name?.toLowerCase().includes('comment failure'),
    )

    expect(escalateJob?.if).not.toContain('usage-limit-hit')
    expect(escalateJob?.if).toContain("needs.render-prompt.result == 'failure'")
    expect(escalateJob?.if).toContain("needs.check-duplicates.result == 'failure'")
    expect(escalateJob?.if).toContain("needs.check-duplicates.result == 'cancelled'")
    expect(escalateJob?.needs).toContain('render-prompt')
    expect(escalateJob?.needs).toContain('check-duplicates')
    expect(escalateJob?.permissions).toMatchObject({ actions: 'read', 'pull-requests': 'write' })
    expect(escalateJob?.env?.['FAILING_RUN_URL']).toContain('github.event.workflow_run.html_url')
    expect(escalateJob?.env?.['EVENT_HEAD_SHA']).toContain('github.event.workflow_run.head_sha')
    expect(escalateJob?.env?.['HEAD_BRANCH']).toContain('github.event.workflow_run.head_branch')
    expect(escalateJob?.env?.['PR_NUMBER']).toContain('triage-and-rerun.outputs.pr_number')
    expect(escalateJob?.env?.['SESSION_ID']).toContain('dispatch.outputs.session-id')
    expect(escalateJob?.env?.['THIS_RUN_URL']).toContain('github.run_id')
    expect(sourceStateStep?.run).not.toContain('node ci/source-run-state.mts')
    expect(sourceStateStep?.run).toContain(
      'gh api "repos/$GITHUB_REPOSITORY/actions/runs/$SOURCE_RUN_ID"',
    )
    expect(commentStep?.if).toBe("steps.source-state.outputs.current == 'true'")
    expect(commentStep?.run).toContain('gh pr comment')
    expect(commentStep?.run).toContain('Suppressing failure comment')
    expect(commentStep?.run).toContain('.head.sha == env.EVENT_HEAD_SHA')
    expect(commentStep?.run).toContain('Dependabot auto-fix could not complete')
    expect(commentStep?.run).toContain('**Failing run:** $FAILING_RUN_URL')
  })
})
