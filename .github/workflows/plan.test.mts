import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type WorkflowJob = {
  'runs-on'?: string | string[]
  'timeout-minutes'?: number
  env?: Record<string, string>
  if?: string
  needs?: string | string[]
  uses?: string
  with?: Record<string, unknown>
  secrets?: string | Record<string, unknown>
  outputs?: Record<string, string>
  permissions?: Record<string, string>
  steps?: Array<{
    id?: string
    name?: string
    if?: string
    run?: string
    uses?: string
    env?: Record<string, string>
    with?: Record<string, unknown>
  }>
}

type Workflow = {
  on?: { issue_comment?: { types?: string[] } }
  jobs?: Record<string, WorkflowJob>
}

const workflowText = readFileSync('.github/workflows/plan.yml', 'utf8')
const planPrompt = readFileSync('docs/prompts/automation/plan.md', 'utf8')
const workflow = load(workflowText) as Workflow

describe('plan workflow', () => {
  it('triggers on authorized issue comments only', () => {
    expect(workflow.on?.issue_comment?.types).toEqual(['created'])

    const gateJob = workflow.jobs?.['gate']
    expect(gateJob?.if).toContain('github.event.issue.pull_request == null')
    expect(gateJob?.if).toContain("contains(github.event.comment.body, '/plan')")
    expect(gateJob?.if).not.toContain('author_association')
    expect(gateJob?.steps?.find(step => step.id === 'authorize')?.uses).toContain(
      '/comment-command-authorize@',
    )
    expect(gateJob?.steps?.find(step => step.id === 'extract-plan')?.if).toBe(
      "steps.authorize.outputs.authorized == 'true'",
    )
    expect(gateJob?.outputs?.['accepted']).toContain("steps.authorize.outputs.authorized == 'true'")
    expect(planPrompt).toMatch(
      /live\s+`author_association` to be exactly `OWNER`, `COLLABORATOR`, or `MEMBER`/,
    )
  })

  it('parses the /plan request through the tooling action', () => {
    const gateJob = workflow.jobs?.['gate']
    const extractStep = gateJob?.steps?.find(step => step.id === 'extract-plan')

    expect(gateJob?.outputs?.['plan_request']).toBe('${{ steps.extract-plan.outputs.request }}')
    expect(extractStep?.uses).toContain('/comment-command-parse@')
    expect(extractStep?.with).toEqual({ command: '/plan' })
  })

  it('rejects non-standalone first lines before acknowledgement or downstream jobs', () => {
    const gateJob = workflow.jobs?.['gate']
    const ackStep = gateJob?.steps?.find(step =>
      step.uses?.includes('/comment-command-acknowledge@'),
    )

    expect(ackStep?.if).toBe("steps.extract-plan.outputs.accepted == 'true'")
    expect(workflow.jobs?.['render-prompt']?.if).toBe("needs.gate.outputs.accepted == 'true'")
    expect(workflow.jobs?.dispatch?.if).toBe("needs.gate.outputs.accepted == 'true'")
    expect(workflow.jobs?.escalate?.if).toContain("needs.gate.outputs.accepted == 'true'")
  })

  it('checks out the trusted event revision before extracting the request', () => {
    const gateJob = workflow.jobs?.['gate']
    const steps = gateJob?.steps ?? []
    const checkoutIndex = steps.findIndex(step => step.uses?.startsWith('actions/checkout@'))
    const checkoutStep = steps[checkoutIndex]
    const extractIndex = steps.findIndex(step => step.id === 'extract-plan')

    expect(gateJob?.permissions).toMatchObject({ contents: 'read', issues: 'write' })
    expect(gateJob?.env).toBeUndefined()
    expect(checkoutStep?.uses).toMatch(/^actions\/checkout@[0-9a-f]{40}$/)
    expect(checkoutStep?.with).toMatchObject({
      'persist-credentials': false,
      ref: '${{ github.sha }}',
    })
    expect(checkoutIndex).toBeGreaterThan(-1)
    expect(extractIndex).toBeGreaterThan(checkoutIndex)
  })

  it('acknowledges the /plan comment through the tooling action', () => {
    const ackStep = workflow.jobs?.['gate']?.steps?.find(step =>
      step.uses?.includes('/comment-command-acknowledge@'),
    )

    expect(ackStep?.with).toEqual({ command: '/plan' })
  })

  it('renders the plan automation template', () => {
    const renderJob = workflow.jobs?.['render-prompt']
    const setupStep = renderJob?.steps?.find(step =>
      step.uses?.includes('/.github/actions/setup-node-pnpm@'),
    )
    const renderStep = renderJob?.steps?.find(step => step.id === 'render')

    expect(renderJob?.['runs-on']).toEqual('ubuntu-latest')
    expect(renderJob?.outputs?.['prompt']).toBe('${{ steps.render.outputs.prompt }}')
    expect(setupStep).toBeDefined()
    expect(renderStep?.uses).toContain('jonathanong/auto-harness/actions/harness-render-prompt@')
    expect(renderStep?.with?.['template']).toBe('docs/prompts/automation/plan.md')
    expect(renderStep?.with?.['var-files']).toContain('ISSUE_TITLE=issue-title.txt')
    expect(renderStep?.with?.['var-files']).toContain('REQUEST_BODY=request-body.txt')
  })

  it('dispatches in issue-comment completion mode', () => {
    const dispatchJob = workflow.jobs?.['dispatch']

    expect(dispatchJob?.uses).toMatch(
      /^vouchington\/vouchington-tooling\/\.github\/workflows\/harness-dispatch\.yml@[0-9a-f]{40}$/u,
    )
    expect(dispatchJob?.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
    expect(dispatchJob?.with?.['completion-mode']).toBe('issue-comment')
    expect(dispatchJob?.with?.['issue-number']).toBe('${{ github.event.issue.number }}')
    expect(dispatchJob?.with?.['prompt']).toBe('${{ needs.render-prompt.outputs.prompt }}')
  })

  it('posts the session link on the issue after a successful dispatch', () => {
    const commentJob = workflow.jobs?.['comment-session']
    const commentStep = commentJob?.steps?.find(step =>
      step.uses?.startsWith(
        'vouchington/vouchington-tooling/.github/actions/comment-harness-session@',
      ),
    )

    expect(commentJob?.if).toContain("needs.dispatch.result == 'success'")
    expect(commentJob?.permissions).toEqual({
      contents: 'read',
      issues: 'write',
      'pull-requests': 'write',
    })
    expect(commentStep?.with).toMatchObject({
      target: '${{ github.event.issue.number }}',
      'session-url': '${{ needs.dispatch.outputs.session-url }}',
    })
  })

  it('comments for immediate dispatch failures', () => {
    const escalateJob = workflow.jobs?.['escalate']
    const commentStep = escalateJob?.steps?.find(step => step.name?.includes('Comment failure'))

    expect(escalateJob?.if).not.toContain('usage-limit-hit')
    expect(escalateJob?.if).toContain("needs.render-prompt.result == 'failure'")
    expect(escalateJob?.needs).toContain('render-prompt')
    expect(escalateJob?.env?.['TRIGGER_COMMENT_ID']).toBe('${{ github.event.comment.id }}')
    const checkStep = escalateJob?.steps?.find(step => step.id === 'check')
    expect(checkStep?.run).toContain('issues/comments/$TRIGGER_COMMENT_ID')
    const revalidateStep = escalateJob?.steps?.find(step =>
      step.uses?.includes('/comment-command-authorize@'),
    )
    expect(revalidateStep?.with).toEqual({
      mode: 'revalidate',
      'issue-number': '${{ github.event.issue.number }}',
    })
    expect(checkStep?.run).toContain('Suppressing failure comment')
    expect(commentStep?.if).toBe("steps.check.outputs.valid == 'true'")
    expect(commentStep?.uses).toContain('/comment-harness-session@')
    expect(commentStep?.with).toMatchObject({
      status: 'failed',
      headline: '/plan run failed — plan generation could not complete.',
    })
  })
})
