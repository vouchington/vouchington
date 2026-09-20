import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { executeGateWithTitle } from './shepherd.test-helpers.mts'
type WorkflowJob = {
  'runs-on'?: string | string[]
  permissions?: Record<string, string>
  env?: Record<string, string>
  if?: string
  needs?: string | string[]
  uses?: string
  with?: Record<string, unknown>
  secrets?: string | Record<string, unknown>
  outputs?: Record<string, string>
  steps?: Array<{
    id?: string
    name?: string
    if?: string
    run?: string
    uses?: string
    with?: Record<string, unknown>
    env?: Record<string, string>
  }>
}
type Workflow = {
  on?: { issue_comment?: { types?: string[] } }
  permissions?: Record<string, string>
  concurrency?: Record<string, unknown>
  jobs?: Record<string, WorkflowJob>
}

const workflowText = readFileSync('.github/workflows/shepherd.yml', 'utf8')
const shepherdPrompt = readFileSync('docs/prompts/automation/shepherd.md', 'utf8')
const workflow = load(workflowText) as Workflow
describe('shepherd workflow', () => {
  it('triggers on new PR conversation comments', () => {
    expect(workflow.on?.issue_comment?.types).toEqual(['created'])

    const gateJob = workflow.jobs?.['gate']
    expect(gateJob?.if).toContain('github.event.issue.pull_request != null')
    expect(gateJob?.if).toContain("contains(github.event.comment.body, '/shepherd')")
  })

  it('uses the same authorized associations as /fix (OWNER + COLLABORATOR + MEMBER)', () => {
    const gateJob = workflow.jobs?.['gate']
    expect(gateJob?.if).toContain(`fromJSON('["OWNER","COLLABORATOR","MEMBER"]')`)
    expect(gateJob?.if).not.toMatch(/CONTRIBUTOR|NONE/)
    expect(shepherdPrompt).toContain('require its body to remain exactly `/shepherd`')
    expect(shepherdPrompt).toMatch(
      /live\s+`author_association` to be exactly `OWNER`, `COLLABORATOR`, or `MEMBER`/,
    )
  })

  it('validates an exact standalone command and same-repo PR', () => {
    const gateJob = workflow.jobs?.['gate']
    const gateStep = gateJob?.steps?.find(step => step.id === 'gate')
    expect(gateStep?.env?.['COMMENT_BODY']).toBe('${{ github.event.comment.body }}')
    expect(gateStep?.env?.['PR_NUMBER']).toBe('${{ github.event.issue.number }}')
    expect(gateStep?.run).toContain('COMMAND="$(printf')
    expect(gateStep?.run).toContain('[[ "$COMMAND" != "/shepherd" ]]')
    expect(gateStep?.run).toContain('gh api "repos/$GITHUB_REPOSITORY/pulls/$PR_NUMBER"')
    expect(gateStep?.run).toContain('HEAD_REPO')
    expect(gateStep?.run).toContain('Cannot run \\`/shepherd\\` on fork PRs')
    expect(gateStep?.run).toContain('should_dispatch=true')
  })

  it('keeps the elevated Codex token off trusted checkout and output serialization', () => {
    const gateJob = workflow.jobs?.['gate']
    const steps = gateJob?.steps ?? []
    const rootCheckoutIndex = steps.findIndex(
      step => step.uses?.startsWith('actions/checkout@') && step.with?.['path'] === undefined,
    )
    const rootCheckout = steps[rootCheckoutIndex]
    const gateIndex = steps.findIndex(step => step.id === 'gate')
    const gateStep = steps[gateIndex]
    expect(gateJob?.env).toBeUndefined()
    expect(rootCheckout?.uses).toMatch(/^actions\/checkout@[0-9a-f]{40}$/)
    expect(rootCheckout?.with).toMatchObject({
      'persist-credentials': false,
      ref: '${{ github.sha }}',
    })
    expect(rootCheckoutIndex).toBeGreaterThan(-1)
    expect(gateIndex).toBeGreaterThan(rootCheckoutIndex)
    expect(gateStep?.env?.['GH_TOKEN']).toBe('${{ github.token }}')
  })

  it('keeps untrusted multiline PR titles inside their output record', () => {
    const gateStep = workflow.jobs?.['gate']?.steps?.find(step => step.id === 'gate')
    const gateRun = gateStep?.run
    expect(gateRun).toBeDefined()
    if (!gateRun) throw new Error('Missing gate script')

    const { githubOutput, outputs, prTitle, trustedPrUrl } = executeGateWithTitle(gateRun)
    expect(githubOutput).toMatch(/(?:^|\n)pr_title<<(PR_TITLE_[A-F0-9]{32})\n[\s\S]*?\n\1\n/)
    expect(outputs['pr_title']).toBe(prTitle)
    expect(outputs['pr_number']).toBe('7611')
    expect(outputs['pr_url']).toBe(trustedPrUrl)
    expect(outputs['pr_head_ref']).toBe('fix/pr-title-output')
    expect(outputs['should_dispatch']).toBe('true')
    expect(outputs).not.toHaveProperty('injected_output')
    expect(executeGateWithTitle(gateRun, '-n').outputs['pr_title']).toBe('-n')
  })

  it('behaviorally rejects non-standalone commands', () => {
    const gateRun = workflow.jobs?.['gate']?.steps?.find(step => step.id === 'gate')?.run
    expect(gateRun).toBeDefined()
    if (!gateRun) throw new Error('Missing gate script')

    const { ghLog, outputs } = executeGateWithTitle(gateRun, 'Ignored', {
      commentBody: '/shepherd please',
    })
    expect(outputs['should_dispatch']).toBe('false')
    expect(outputs).not.toHaveProperty('pr_number')
    expect(ghLog).toBe('')
  })

  it('behaviorally rejects fork PRs', () => {
    const gateRun = workflow.jobs?.['gate']?.steps?.find(step => step.id === 'gate')?.run
    expect(gateRun).toBeDefined()
    if (!gateRun) throw new Error('Missing gate script')

    const { ghLog, outputs } = executeGateWithTitle(gateRun, 'Fork PR', {
      headRepo: 'someone/filaments',
    })
    expect(outputs['should_dispatch']).toBe('false')
    expect(outputs).not.toHaveProperty('pr_number')
    expect(ghLog).toContain('Cannot run `/shepherd` on fork PRs')
  })

  it('prepares append-only bot checkpoint state and acknowledges the command with eyes', () => {
    const gateJob = workflow.jobs?.['gate']
    const steps = gateJob?.steps ?? []
    const ackStep = gateJob?.steps?.find(step => step.name?.toLowerCase().includes('reaction'))
    const checkpointStep = gateJob?.steps?.find(step => step.id === 'checkpoint')
    const setupNodeIndex = steps.findIndex(
      step => step.uses === './.github/actions/setup-node-pnpm',
    )
    const checkpointIndex = steps.findIndex(step => step.id === 'checkpoint')

    expect(gateJob?.permissions?.['actions']).toBe('read')
    expect(gateJob?.permissions?.['issues']).toBe('write')
    expect(gateJob?.permissions?.['pull-requests']).toBe('write')
    expect(setupNodeIndex).toBeGreaterThan(-1)
    expect(setupNodeIndex).toBeLessThan(checkpointIndex)
    expect(steps[setupNodeIndex]?.with).toBeUndefined()
    expect(checkpointStep?.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    expect(checkpointStep?.run).toContain('github-actions[bot]')
    expect(checkpointStep?.run).toContain('shepherd-checkpoint-cli.mts select')
    expect(checkpointStep?.run).toContain('shepherd-checkpoint-cli.mts render')
    expect(checkpointStep?.run).toContain('comments?per_page=100')
    expect(checkpointStep?.run).toContain('gh api -X POST')
    expect(checkpointStep?.run).toContain('COMMENT_JSON=')
    expect(checkpointStep?.run).toContain('.user.login == "github-actions[bot]"')
    expect(checkpointStep?.run).toContain('CHECKPOINT_COMMENT_ID=')
    expect(checkpointStep?.run).toContain('checkpoint_comment_id=$CHECKPOINT_COMMENT_ID')
    expect(gateJob?.outputs?.['checkpoint_comment_id']).toBe(
      '${{ steps.checkpoint.outputs.checkpoint_comment_id }}',
    )
    expect(gateJob?.outputs?.['checkpoint_body']).toBeUndefined()
    expect(gateJob?.outputs?.['resume_session_id']).toBe(
      '${{ steps.checkpoint.outputs.resume_session_id }}',
    )
    expect(ackStep?.if).toContain("steps.gate.outputs.should_dispatch == 'true'")
    expect(ackStep?.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    expect(ackStep?.run).toContain('reactions')
    expect(ackStep?.run).toContain('eyes')
  })

  it('dispatches pr-shepherd through the reusable Harness workflow', () => {
    const dispatchJob = workflow.jobs?.['dispatch']

    expect(dispatchJob?.needs).toContain('gate')
    expect(dispatchJob?.needs).toContain('render-prompt')
    expect(dispatchJob?.if).toContain("needs.gate.outputs.should_dispatch == 'true'")
    expect(dispatchJob?.uses).toBe('./.github/workflows/harness-dispatch.yml')
    expect(dispatchJob?.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
    expect(dispatchJob?.with?.['agent-ref']).toBe(
      'refs/heads/${{ needs.gate.outputs.pr_head_ref }}',
    )
    expect(dispatchJob?.with?.['expected-head-sha']).toBe('${{ needs.gate.outputs.pr_head_sha }}')
    expect(dispatchJob?.with?.['prompt']).toBe('${{ needs.render-prompt.outputs.prompt }}')
    expect(dispatchJob?.with?.['pr-number']).toBeUndefined()
    expect(dispatchJob?.with?.['pr-shepherd-version']).toBe(
      '${{ needs.render-prompt.outputs.pr_shepherd_version }}',
    )
    expect(dispatchJob?.with?.['resume-session-id']).toBe(
      '${{ needs.gate.outputs.resume_session_id }}',
    )
    expect(dispatchJob?.with?.['checkpoint-issue-number']).toBe(
      '${{ needs.gate.outputs.pr_number }}',
    )
    expect(dispatchJob?.with?.['checkpoint-comment-id']).toBeUndefined()
    expect(dispatchJob?.with?.['checkpoint-body']).toBeUndefined()
    expect(dispatchJob?.with?.['enable-hooks']).toBeUndefined()
    expect(dispatchJob?.with?.['required-managed-hook-digest']).toBeUndefined()
  })

  it('dispatches same-repository PRs without changed-path or immutable-head inspection', () => {
    const gateJob = workflow.jobs?.['gate']
    const checkoutStep = gateJob?.steps?.find(step => step.with?.['path'] === '.gated-pr')
    const inspectStep = gateJob?.steps?.find(step => step.id === 'inspect')

    expect(gateJob?.outputs?.['should_dispatch']).toBe('${{ steps.gate.outputs.should_dispatch }}')
    expect(checkoutStep).toBeUndefined()
    expect(inspectStep).toBeUndefined()
    expect(workflowText).not.toContain('.gated-pr')
    expect(workflowText).not.toContain('pulls/$PR_NUMBER/files')
    expect(workflowText).not.toContain('PR_CHANGED_FILE_COUNT')
    expect(workflowText).toContain('expected-head-sha')
    expect(workflowText).not.toContain('This preflight gate is permanent')
  })

  it('allows stale or conflicted branches and never reintroduces a base-state gate', () => {
    const gateStep = workflow.jobs?.['gate']?.steps?.find(step => step.id === 'gate')
    const gateRun = gateStep?.run ?? ''

    const { outputs } = executeGateWithTitle(gateRun, 'Conflicted PR', {
      prFields: {
        mergeable: false,
        mergeable_state: 'dirty',
        state: 'open',
      },
    })
    expect(outputs['should_dispatch']).toBe('true')
    expect(outputs['pr_head_ref']).toBe('fix/pr-title-output')

    // #7608 removed a gate that required the PR head to contain current main before Codex
    // hooks could be trusted, which blocked ordinary stale/diverged branches. Mergeability and
    // conflict checks would recreate the same deadlock when GitHub cannot offer Update branch:
    // resolving that state is deliberately pr-shepherd's job.
    expect(gateRun).not.toContain('repos/$GITHUB_REPOSITORY/commits/main')
    expect(gateRun).not.toContain('/compare/')
    expect(gateRun).not.toContain('mergeable')
    expect(gateRun).not.toContain('mergeStateStatus')
    expect(gateRun).not.toContain('Skipping stale-base PR')
    expect(gateRun).not.toContain('COMPARE_FILE_COUNT')
    expect(gateRun).not.toContain('ALLOW_POLICY_PRS')
  })

  it('grants checkpoint-dispatch checkout access alongside its comment-patch scopes', () => {
    // A job-level `permissions:` block replaces, not merges with, the workflow-level default
    // (omitting `contents` 404'd checkout in run 33044744778). PATCHing a PR-parented comment
    // needs `pull-requests: write`; `issues: write` alone 403'd live (run 33220457046).
    const checkpointJob = workflow.jobs?.['checkpoint-dispatch']
    expect(checkpointJob?.permissions?.['contents']).toBe('read')
    expect(checkpointJob?.permissions?.['issues']).toBe('write')
    expect(checkpointJob?.permissions?.['pull-requests']).toBe('write')

    const checkoutStep = checkpointJob?.steps?.find(step =>
      step.uses?.startsWith('actions/checkout@'),
    )
    expect(checkoutStep).toBeDefined()
  })

  it('installs node_modules so the checkpoint CLI can resolve vouchington-tooling on any runner', () => {
    // `node ci/shepherd-checkpoint-cli.mts` imports `vouchington-tooling`, so `setup-node-pnpm`
    // must run before it on this fresh, ephemeral runner (confirmed live in run 33052532851, job
    // 98451531593, back when a hard `clean: true` checkout wiped node_modules ahead of it).
    const checkpointJob = workflow.jobs?.['checkpoint-dispatch']
    const steps = checkpointJob?.steps ?? []
    const checkoutIndex = steps.findIndex(step => step.uses?.startsWith('actions/checkout@'))
    const setupNodeIndex = steps.findIndex(
      step => step.uses === './.github/actions/setup-node-pnpm',
    )
    const checkpointCliIndex = steps.findIndex(step =>
      step.run?.includes('ci/shepherd-checkpoint-cli.mts'),
    )

    expect(checkoutIndex).toBeGreaterThanOrEqual(0)
    expect(setupNodeIndex).toBeGreaterThan(checkoutIndex)
    expect(checkpointCliIndex).toBeGreaterThan(setupNodeIndex)
    expect(steps[setupNodeIndex]?.with).toBeUndefined()
  })

  it('comments on the PR for immediate dispatch failures', () => {
    const escalateJob = workflow.jobs?.['escalate']
    expect(escalateJob?.if).toContain('always()')
    expect(escalateJob?.if).toContain("needs.gate.outputs.should_dispatch == 'true'")
    expect(escalateJob?.if).not.toContain('usage-limit-hit')
    expect(escalateJob?.if).toContain("needs.render-prompt.result == 'failure'")
    expect(escalateJob?.if).toContain("needs.checkpoint-dispatch.result == 'failure'")
    expect(escalateJob?.if).toContain("needs.checkpoint-dispatch.result == 'cancelled'")
    expect(escalateJob?.needs).toContain('render-prompt')
    expect(escalateJob?.env?.['PR_NUMBER']).toBe('${{ needs.gate.outputs.pr_number }}')
    expect(escalateJob?.env?.['PR_URL']).toBe('${{ needs.gate.outputs.pr_url }}')
    expect(escalateJob?.env?.['SESSION_ID']).toBe('${{ needs.dispatch.outputs.session-id }}')
    expect(escalateJob?.env?.['TRIGGER_COMMENT_ID']).toBe('${{ github.event.comment.id }}')

    const commentStep = escalateJob?.steps?.find(step => step.name === 'Comment failure on PR')
    expect(commentStep?.run).toContain('pulls/$PR_NUMBER')
    expect(commentStep?.run).toContain('issues/comments/$TRIGGER_COMMENT_ID')
    expect(commentStep?.run).toMatch(/OWNER.*COLLABORATOR.*MEMBER/)
    expect(commentStep?.run).not.toMatch(/CONTRIBUTOR|NONE/)
    expect(commentStep?.run).toContain('Suppressing failure comment')
    expect(commentStep?.run).toContain('gh issue comment "$PR_NUMBER"')
    expect(commentStep?.run).not.toContain('needs.dispatch.outputs.session-id')
    expect(commentStep?.run).toContain('/shepherd run failed')
    expect(commentStep?.run).not.toContain('dispatch-exit-reason')
  })
})
