import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { executeFixRequestExtraction } from './fix-issue.test-helpers.mts'

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
const harnessDispatch = read('.github/workflows/harness-dispatch.yml')
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

  it('gates on /fix body and OWNER/COLLABORATOR/MEMBER author_association', () => {
    const gateJob = parsedIssue.jobs?.['gate']

    expect(gateJob?.if).toContain("contains(github.event.comment.body, '/fix')")
    expect(gateJob?.if).toContain(`fromJSON('["OWNER","COLLABORATOR","MEMBER"]')`)
    expect(gateJob?.if).not.toContain('CONTRIBUTOR')
    expect(gateJob?.if).not.toContain('NONE')
    expect(gateJob?.if).toContain('author_association')
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

  it('acknowledges the /fix comment with an eyes reaction and first-attempt run link', () => {
    const gateJob = parsedIssue.jobs?.['gate']
    const ackStep = gateJob?.steps?.find(s => s.name?.toLowerCase().includes('react'))

    expect(ackStep).toBeDefined()
    expect(gateJob?.permissions?.['issues']).toBe('write')
    expect(ackStep?.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    expect(ackStep?.env?.['ISSUE_NUMBER']).toBe('${{ github.event.issue.number }}')
    expect(ackStep?.env?.['RUN_ATTEMPT']).toBe('${{ github.run_attempt }}')
    expect(ackStep?.env?.['RUN_URL']).toBe(
      '${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}',
    )
    expect(ackStep?.run).toContain('reactions')
    expect(ackStep?.run).toContain('eyes')
    expect(ackStep?.run).toContain('[[ "$RUN_ATTEMPT" == "1" ]]')
    expect(ackStep?.run).toContain('gh issue comment "$ISSUE_NUMBER"')
    expect(ackStep?.run).toContain('[View the automation workflow run]($RUN_URL)')
    expect(ackStep?.run).toContain('::warning::Could not add eyes reaction')
    expect(ackStep?.run).toContain('::warning::Could not post workflow run link')
    expect(ackStep?.run).toContain('GITHUB_STEP_SUMMARY')
    expect(ackStep?.run).toContain('Harness dispatch')
  })

  it('extracts the text after /fix as a gate output with CI diagnostics', () => {
    const gateJob = parsedIssue.jobs?.['gate']
    const extractStep = gateJob?.steps?.find(s => s.id === 'extract-fix')

    expect(gateJob?.outputs?.['accepted']).toBe('${{ steps.extract-fix.outputs.accepted }}')
    expect(gateJob?.outputs?.['fix_request']).toBe('${{ steps.extract-fix.outputs.fix_request }}')
    expect(extractStep?.env?.['COMMENT_BODY']).toBe('${{ github.event.comment.body }}')
    expect(extractStep?.env?.['COMMENT_ID']).toBe('${{ github.event.comment.id }}')
    expect(extractStep?.run).toContain('/fix')
    expect(extractStep?.run).toContain(
      'write-github-multiline-output.sh" fix_request < "$REQUEST_FILE"',
    )
    expect(extractStep?.run).toContain('::error::Unable to extract exact /fix command')
    expect(extractStep?.run).toContain('GITHUB_STEP_SUMMARY')
    expect(extractStep?.run).toContain('comment_id=$COMMENT_ID')
    expect(extractStep?.run).toContain('comment_length=$COMMENT_LENGTH')
    expect(extractStep?.run).toContain('preview=$(escape_command "$PREVIEW")')
  })

  it('keeps forged output syntax inside the extracted /fix request', () => {
    const extractStep = parsedIssue.jobs?.['gate']?.steps?.find(step => step.id === 'extract-fix')
    if (!extractStep?.run) throw new Error('Missing /fix extraction script')

    const request = [
      'Preserve the complete request',
      'CODEX_FIX_REQUEST',
      'fix_request=forged',
      'injected_output=true',
      'discarded<<CODEX_FIX_REQUEST',
    ].join('\n')
    const outputs = executeFixRequestExtraction(extractStep.run, `/fix\n${request}`)

    expect(outputs).toEqual({ accepted: 'true', fix_request: request })
  })

  it('rejects non-standalone first lines before acknowledgement or downstream jobs', () => {
    const gateJob = parsedIssue.jobs?.['gate']
    const extractStep = gateJob?.steps?.find(step => step.id === 'extract-fix')
    const ackStep = gateJob?.steps?.find(step => step.name?.toLowerCase().includes('react'))
    if (!extractStep?.run) throw new Error('Missing /fix extraction script')

    expect(executeFixRequestExtraction(extractStep.run, 'please /fix this')).toEqual({
      accepted: 'false',
    })
    expect(ackStep?.if).toBe("steps.extract-fix.outputs.accepted == 'true'")
    expect(parsedIssue.jobs?.['render-prompt']?.if).toContain(
      "needs.gate.outputs.accepted == 'true'",
    )
    expect(parsedIssue.jobs?.dispatch?.if).toBe("needs.gate.outputs.accepted == 'true'")
    expect(parsedIssue.jobs?.escalate?.if).toContain("needs.gate.outputs.accepted == 'true'")
  })

  it('dispatches with the explicit Harness secret', () => {
    const dispatchJob = parsedIssue.jobs?.['dispatch']

    expect(dispatchJob?.uses).toBe('./.github/workflows/harness-dispatch.yml')
    expect(dispatchJob?.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
    expect(dispatchJob?.needs).toContain('gate')
    expect(dispatchJob?.needs).toContain('render-prompt')
    expect(dispatchJob?.with?.['prompt']).toBe('${{ needs.render-prompt.outputs.prompt }}')
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
    expect(contextStep?.env?.['GH_TOKEN']).toBe('${{ github.token }}')
    expect(contextStep?.run).toContain('comments?per_page=100')
    expect(contextStep?.run).toContain('last_page')
    expect(contextStep?.run).toContain('.[-100:]')
    expect(contextStep?.run).toContain('commentSnapshot')
    expect(contextStep?.run).toContain('MAX_COMMENT_CHARS=2000')
    expect(contextStep?.run).toContain('bodyTruncated')
    expect(contextStep?.run).toContain('labels')
    expect(fixIssuePrompt).toContain('fixes #')
    expect(fixIssuePrompt).toContain('## Issue')
    expect(fixIssuePrompt).toContain('## Root cause')
    expect(fixIssuePrompt).toContain('## Implementation choice')
    expect(fixIssuePrompt).toContain('## Options considered')
    expect(harnessDispatch).toContain('ci/harness-session-dispatch.mts')
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

    const failStep = escalateJob?.steps?.find(s => s.name?.toLowerCase().includes('comment'))
    expect(escalateJob?.env?.['TRIGGER_COMMENT_ID']).toBe('${{ github.event.comment.id }}')
    expect(failStep?.run).toContain('issues/comments/$TRIGGER_COMMENT_ID')
    expect(failStep?.run).toMatch(/OWNER.*COLLABORATOR.*MEMBER/)
    expect(failStep?.run).not.toMatch(/CONTRIBUTOR|NONE/)
    expect(failStep?.run).toContain('Suppressing failure comment')
    expect(failStep?.run).toContain('gh issue comment')
    expect(failStep?.run).toContain('/fix run failed')
  })

  it('dispatches from the event sha (default branch head at comment time)', () => {
    const dispatchJob = parsedIssue.jobs?.['dispatch']

    expect(dispatchJob?.with?.['agent-ref']).toBe('${{ github.sha }}')
  })
})
