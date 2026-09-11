import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'
import { executeFixRequestExtraction } from './fix-issue.test-helpers.mts'

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
const workflow = load(workflowText) as Workflow

describe('plan workflow', () => {
  it('triggers on authorized issue comments only', () => {
    expect(workflow.on?.issue_comment?.types).toEqual(['created'])

    const gateJob = workflow.jobs?.['gate']
    expect(gateJob?.if).toContain('github.event.issue.pull_request == null')
    expect(gateJob?.if).toContain("contains(github.event.comment.body, '/plan')")
    expect(gateJob?.if).toContain('OWNER')
    expect(gateJob?.if).toContain('COLLABORATOR')
    expect(gateJob?.if).not.toContain('MEMBER')
  })

  it('extracts the request after an exact /plan token', () => {
    const gateJob = workflow.jobs?.['gate']
    const extractStep = gateJob?.steps?.find(step => step.id === 'extract-plan')

    expect(gateJob?.outputs?.['accepted']).toBe('${{ steps.extract-plan.outputs.accepted }}')
    expect(gateJob?.outputs?.['plan_request']).toBe(
      '${{ steps.extract-plan.outputs.plan_request }}',
    )
    expect(extractStep?.run).toContain('/plan')
    expect(extractStep?.run).toContain(
      'write-github-multiline-output.sh" plan_request < "$REQUEST_FILE"',
    )
    expect(extractStep?.run).toContain('::error::Unable to extract exact /plan command')
  })

  it('rejects non-standalone first lines before acknowledgement or downstream jobs', () => {
    const gateJob = workflow.jobs?.['gate']
    const extractStep = gateJob?.steps?.find(step => step.id === 'extract-plan')
    const ackStep = gateJob?.steps?.find(step => step.name?.toLowerCase().includes('reaction'))
    if (!extractStep?.run) throw new Error('Missing /plan extraction script')

    expect(executeFixRequestExtraction(extractStep.run, 'please /plan this')).toEqual({
      accepted: 'false',
    })
    expect(ackStep?.if).toBe("steps.extract-plan.outputs.accepted == 'true'")
    expect(workflow.jobs?.['render-prompt']?.if).toBe("needs.gate.outputs.accepted == 'true'")
    expect(workflow.jobs?.dispatch?.if).toBe("needs.gate.outputs.accepted == 'true'")
    expect(workflow.jobs?.escalate?.if).toContain("needs.gate.outputs.accepted == 'true'")
  })

  it('accepts a standalone /plan for live issue inspection', () => {
    const gateJob = workflow.jobs?.['gate']
    const extractStep = gateJob?.steps?.find(step => step.id === 'extract-plan')
    const ackStep = gateJob?.steps?.find(step => step.name?.toLowerCase().includes('reaction'))
    if (!extractStep?.run) throw new Error('Missing /plan extraction script')
    const extractionScript = extractStep.run

    expect(executeFixRequestExtraction(extractionScript, '/plan')).toEqual({
      accepted: 'true',
      plan_request: '',
    })
    expect(extractionScript).not.toContain('authorized bounded issue snapshot')
    expect(ackStep?.if).toBe("steps.extract-plan.outputs.accepted == 'true'")
    expect(workflow.jobs?.['render-prompt']?.if).toBe("needs.gate.outputs.accepted == 'true'")
    expect(workflow.jobs?.dispatch?.if).toBe("needs.gate.outputs.accepted == 'true'")
  })

  it('normalizes whitespace-only requests while preserving valid request text', () => {
    const extractStep = workflow.jobs?.gate?.steps?.find(step => step.id === 'extract-plan')
    if (!extractStep?.run) throw new Error('Missing /plan extraction script')
    const extractScript = extractStep.run

    expect(executeFixRequestExtraction(extractScript, '/plan\n  \n\t  ')).toEqual({
      accepted: 'true',
      plan_request: '  \n\t  ',
    })
    expect(
      executeFixRequestExtraction(extractScript, '/plan\nInvestigate the retry policy.'),
    ).toEqual({
      accepted: 'true',
      plan_request: 'Investigate the retry policy.',
    })
    expect(extractScript).not.toContain(`grep -q '[^[:space:]]' "$REQUEST_FILE"`)
  })

  it('checks out and cleans the trusted event revision before extracting the request', () => {
    const gateJob = workflow.jobs?.['gate']
    const steps = gateJob?.steps ?? []
    const checkoutStep = steps.find(step => step.uses?.startsWith('actions/checkout@'))
    const cleanIndex = steps.findIndex(step => step.uses === './.github/actions/clean-workspace')
    const extractIndex = steps.findIndex(step => step.id === 'extract-plan')

    expect(gateJob?.permissions).toMatchObject({ contents: 'read', issues: 'write' })
    expect(gateJob?.env).toBeUndefined()
    expect(checkoutStep?.uses).toMatch(/^actions\/checkout@[0-9a-f]{40}$/)
    expect(checkoutStep?.with).toMatchObject({
      clean: false,
      'persist-credentials': false,
      ref: '${{ github.sha }}',
    })
    expect(cleanIndex).toBeGreaterThan(-1)
    expect(extractIndex).toBeGreaterThan(cleanIndex)
  })

  it('acknowledges the /plan comment with an eyes reaction and first-attempt run link', () => {
    const gateJob = workflow.jobs?.['gate']
    const ackStep = gateJob?.steps?.find(step => step.name?.toLowerCase().includes('reaction'))

    expect(ackStep).toBeDefined()
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
  })

  it('renders the plan automation template', () => {
    const renderJob = workflow.jobs?.['render-prompt']
    const setupStep = renderJob?.steps?.find(step =>
      step.uses?.endsWith('/.github/actions/setup-node-pnpm'),
    )
    const renderStep = renderJob?.steps?.find(step => step.id === 'render')

    expect(renderJob?.['runs-on']).toEqual(['self-hosted'])
    expect(renderJob?.outputs?.['prompt']).toBe('${{ steps.render.outputs.prompt }}')
    expect(setupStep).toBeDefined()
    expect(renderStep?.uses).toContain('jonathanong/auto-harness/actions/harness-render-prompt@')
    expect(renderStep?.with?.['template']).toBe('docs/prompts/automation/plan.md')
    expect(renderStep?.with?.['var-files']).toContain('ISSUE_TITLE=issue-title.txt')
    expect(renderStep?.with?.['var-files']).toContain('REQUEST_BODY=request-body.txt')
  })

  it('dispatches in issue-comment completion mode', () => {
    const dispatchJob = workflow.jobs?.['dispatch']

    expect(dispatchJob?.uses).toBe('./.github/workflows/harness-dispatch.yml')
    expect(dispatchJob?.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
    expect(dispatchJob?.with?.['completion-mode']).toBe('issue-comment')
    expect(dispatchJob?.with?.['issue-number']).toBe('${{ github.event.issue.number }}')
    expect(dispatchJob?.with?.['prompt']).toBe('${{ needs.render-prompt.outputs.prompt }}')
  })

  it('comments for immediate dispatch failures', () => {
    const escalateJob = workflow.jobs?.['escalate']
    const commentStep = escalateJob?.steps?.find(step => step.name?.includes('Comment failure'))

    expect(escalateJob?.if).not.toContain('usage-limit-hit')
    expect(escalateJob?.if).toContain("needs.render-prompt.result == 'failure'")
    expect(escalateJob?.needs).toContain('render-prompt')
    expect(escalateJob?.env?.['TRIGGER_COMMENT_ID']).toBe('${{ github.event.comment.id }}')
    expect(commentStep?.run).toContain('issues/comments/$TRIGGER_COMMENT_ID')
    expect(commentStep?.run).toContain('author_association')
    expect(commentStep?.run).toContain('Suppressing failure comment')
    expect(commentStep?.run).toContain('gh issue comment')
    expect(commentStep?.run).toContain('/plan run failed')
  })
})
