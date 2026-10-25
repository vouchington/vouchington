import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')

type WorkflowJob = {
  'runs-on'?: string | string[]
  'timeout-minutes'?: number
  permissions?: Record<string, string>
  env?: Record<string, string>
  needs?: string | string[]
  uses?: string
  with?: Record<string, unknown>
  secrets?: string | Record<string, unknown>
  if?: string
  outputs?: Record<string, string>
  steps?: Array<{
    name?: string
    id?: string
    if?: string
    uses?: string
    with?: Record<string, unknown>
    run?: string
    env?: Record<string, string>
  }>
}

type Workflow = {
  on?: unknown
  jobs?: Record<string, WorkflowJob>
}

const fixIssue = read('.github/workflows/fix-issue.yml')
const fixIssuePrompt = read('docs/prompts/automation/fix-issue.md')
const parsedIssue = load(fixIssue) as Workflow

describe('fix-issue workflow', () => {
  it('relies on the concurrency-id dedup primitive rather than a job-level skip gate', () => {
    expect(parsedIssue.jobs?.['check-duplicates']).toBeUndefined()

    expect(parsedIssue.jobs?.dispatch?.with?.['publish-duplicate-key']).toContain('fixes #')
    expect(parsedIssue.jobs?.dispatch?.with?.['pr-label']).toBe('automation:auto-fix')

    const renderJob = parsedIssue.jobs?.['render-prompt']
    expect(renderJob?.needs).toEqual(['gate'])
    expect(renderJob?.if).not.toContain('.outputs.skip')
    expect(parsedIssue.jobs?.dispatch?.if).not.toContain('.outputs.skip')
  })

  it('requires the created PR to carry universal and auto-fix labels', () => {
    expect(fixIssuePrompt).toContain('`automation`')
    expect(fixIssuePrompt).toContain('`automation:auto-fix`')
  })

  it('reports a non-authorization stop on the issue once, and stays silent otherwise', () => {
    expect(fixIssuePrompt).toContain('`## Automation stopped`')
    expect(fixIssuePrompt).toContain('commenting `/fix` again retries')
    expect(fixIssuePrompt).toContain('those stops stay silent')
  })

  it('triggers on issue_comment created events but not PR comments', () => {
    const on = parsedIssue.on as {
      issue_comment?: { types?: string[] }
    }

    expect(on.issue_comment).toBeDefined()
    expect(on.issue_comment?.types).toContain('created')

    // Gate job guards against PR comments (issue.pull_request == null check)
    const gateJob = parsedIssue.jobs?.['gate']
    expect(gateJob?.if).toContain('github.event.issue.pull_request == null')
  })

  it('authorizes the commenter with the tooling action before accepting the request', () => {
    const gateJob = parsedIssue.jobs?.['gate']
    const authorizeStep = gateJob?.steps?.find(step => step.id === 'authorize')
    const extractStep = gateJob?.steps?.find(step => step.id === 'extract-fix')

    expect(gateJob?.if).toContain("contains(github.event.comment.body, '/fix')")
    expect(gateJob?.if).not.toContain('author_association')
    expect(authorizeStep?.uses).toContain('/comment-command-authorize@')
    expect(authorizeStep?.with).toBeUndefined()
    expect(extractStep?.if).toBe("steps.authorize.outputs.authorized == 'true'")
    expect(gateJob?.outputs?.['accepted']).toContain("steps.authorize.outputs.authorized == 'true'")
    expect(fixIssuePrompt).toMatch(
      /live\s+`author_association` to be exactly `OWNER`, `COLLABORATOR`, or `MEMBER`/,
    )
  })

  it('checks out the trusted event revision before extracting the request', () => {
    const gateJob = parsedIssue.jobs?.['gate']
    const steps = gateJob?.steps ?? []
    const checkoutIndex = steps.findIndex(step => step.uses?.startsWith('actions/checkout@'))
    const checkoutStep = steps[checkoutIndex]
    const extractIndex = steps.findIndex(step => step.id === 'extract-fix')

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

  it('acknowledges the /fix comment through the tooling action', () => {
    const ackStep = parsedIssue.jobs?.['gate']?.steps?.find(step =>
      step.uses?.includes('/comment-command-acknowledge@'),
    )

    expect(ackStep?.if).toBe("steps.extract-fix.outputs.accepted == 'true'")
    expect(ackStep?.with).toEqual({ command: '/fix' })
    expect(parsedIssue.jobs?.['gate']?.permissions?.['issues']).toBe('write')
  })

  it('parses the /fix request through the tooling action', () => {
    const gateJob = parsedIssue.jobs?.['gate']
    const extractStep = gateJob?.steps?.find(s => s.id === 'extract-fix')

    expect(gateJob?.outputs?.['fix_request']).toBe('${{ steps.extract-fix.outputs.request }}')
    expect(extractStep?.uses).toContain('/comment-command-parse@')
    expect(extractStep?.with).toEqual({ command: '/fix' })
  })

  it('rejects non-standalone first lines before acknowledgement or downstream jobs', () => {
    const gateJob = parsedIssue.jobs?.['gate']
    const ackStep = gateJob?.steps?.find(step =>
      step.uses?.includes('/comment-command-acknowledge@'),
    )

    expect(ackStep?.if).toBe("steps.extract-fix.outputs.accepted == 'true'")
    expect(parsedIssue.jobs?.['render-prompt']?.if).toContain(
      "needs.gate.outputs.accepted == 'true'",
    )
    expect(parsedIssue.jobs?.dispatch?.if).toBe("needs.gate.outputs.accepted == 'true'")
    expect(parsedIssue.jobs?.escalate?.if).toContain("needs.gate.outputs.accepted == 'true'")
  })

  it('dispatches with the explicit Harness secret', () => {
    const dispatchJob = parsedIssue.jobs?.['dispatch']

    expect(dispatchJob?.uses).toMatch(
      /^vouchington\/vouchington-tooling\/\.github\/workflows\/harness-dispatch\.yml@[0-9a-f]{40}$/u,
    )
    expect(dispatchJob?.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
    expect(dispatchJob?.needs).toContain('gate')
    expect(dispatchJob?.needs).toContain('render-prompt')
    expect(dispatchJob?.with?.['prompt']).toBe('${{ needs.render-prompt.outputs.prompt }}')
  })

  it('posts the session link on the issue after a successful dispatch', () => {
    const commentJob = parsedIssue.jobs?.['comment-session']
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

  it('instructs Codex to fix the issue with PR title ending in (fixes #N)', () => {
    const renderJob = parsedIssue.jobs?.['render-prompt']
    const setupStep = renderJob?.steps?.find(s => s.uses?.endsWith('/setup-node-pnpm'))
    const renderStep = renderJob?.steps?.find(s => s.id === 'render')

    expect(setupStep).toBeDefined()
    expect(renderStep?.uses).toContain('jonathanong/auto-harness/actions/harness-render-prompt@')
    expect(renderStep?.with?.['template']).toBe('docs/prompts/automation/fix-issue.md')
    expect(renderStep?.with?.['var-files']).toContain('ISSUE_TITLE=issue-title.txt')
    expect(renderStep?.with?.['var-files']).toContain('REQUEST_BODY=request-body.txt')
    expect(renderStep?.with?.['var-files']).toContain('ISSUE_CONTEXT=issue-context.json')
    const contextStep = renderJob?.steps?.find(s => s.name?.includes('issue context'))
    expect(contextStep?.uses).toContain('/issue-comment-context@')
    expect(contextStep?.with).toEqual({ number: '${{ github.event.issue.number }}' })
    expect(fixIssuePrompt).toContain('fixes #')
    expect(fixIssuePrompt).toContain('start `summary` with the issue URL')
    expect(fixIssuePrompt).toContain('## Root cause')
    expect(fixIssuePrompt).toContain('## Implementation choice')
    expect(fixIssuePrompt).toContain('## Options considered')
  })

  it('passes source issue context for Slack autofixer threads', () => {
    const dispatchJob = parsedIssue.jobs?.['dispatch']
    const slackSource = dispatchJob?.with?.['slack-source'] as string

    expect(slackSource).toContain('/fix')
    expect(slackSource).toContain('Issue:')
    expect(slackSource).toContain('Issue title:')
  })

  it('reports ambiguity and binds publication to live trigger revalidation', () => {
    expect(fixIssuePrompt).toContain('{{TRIGGER_COMMENT_ID}}')
    expect(fixIssuePrompt).not.toContain('codex-completion.json')
  })

  it('escalates immediate dispatch failures', () => {
    const escalateJob = parsedIssue.jobs?.['escalate']

    expect(escalateJob?.if).not.toContain('usage-limit-hit')
  })

  it('comments failure on source issue when dispatch fails for non-usage-limit reasons', () => {
    const escalateJob = parsedIssue.jobs?.['escalate']

    expect(escalateJob?.if).toContain('always()')
    expect(escalateJob?.if).toContain("needs.gate.result == 'success'")
    expect(escalateJob?.if).toContain("needs.dispatch.result == 'failure'")
    expect(escalateJob?.if).toContain("needs.render-prompt.result == 'failure'")
    expect(escalateJob?.needs).toContain('render-prompt')
    expect(escalateJob?.needs).not.toContain('check-duplicates')

    const failStep = escalateJob?.steps?.find(s => s.name?.startsWith('Comment failure'))
    const revalidateStep = escalateJob?.steps?.find(s =>
      s.uses?.includes('/comment-command-authorize@'),
    )
    expect(escalateJob?.steps?.indexOf(revalidateStep!)).toBeLessThan(
      escalateJob?.steps?.indexOf(failStep!) ?? -1,
    )
    expect(revalidateStep?.with).toEqual({
      mode: 'revalidate',
      'issue-number': '${{ github.event.issue.number }}',
    })
    expect(escalateJob?.env?.['TRIGGER_COMMENT_ID']).toBe('${{ github.event.comment.id }}')
    const checkStep = escalateJob?.steps?.find(s => s.id === 'check')
    expect(checkStep?.run).toContain('issues/comments/$TRIGGER_COMMENT_ID')
    expect(checkStep?.run).toContain('Suppressing failure comment')
    expect(failStep?.if).toBe("steps.check.outputs.valid == 'true'")
    expect(failStep?.uses).toContain('/comment-harness-session@')
    expect(failStep?.with).toMatchObject({
      status: 'failed',
      headline: '/fix run failed — auto-fix could not complete.',
    })
  })

  it('dispatches from the event sha (default branch head at comment time)', () => {
    const dispatchJob = parsedIssue.jobs?.['dispatch']

    expect(dispatchJob?.with?.['agent-ref']).toBe('${{ github.sha }}')
  })
})
