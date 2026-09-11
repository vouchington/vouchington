import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type WorkflowJob = {
  'runs-on'?: string | string[]
  if?: string
  needs?: string | string[]
  uses?: string
  with?: Record<string, unknown>
  secrets?: string | Record<string, unknown>
  outputs?: Record<string, string>
  permissions?: Record<string, string>
  steps?: Array<{
    id?: string
    if?: string
    name?: string
    run?: string
    uses?: string
    with?: Record<string, unknown>
    env?: Record<string, string>
  }>
}

type Workflow = {
  on?: {
    schedule?: Array<{ cron: string }>
    workflow_dispatch?: { inputs?: Record<string, unknown> }
  }
  permissions?: Record<string, string>
  concurrency?: Record<string, unknown>
  jobs?: Record<string, WorkflowJob>
}

const workflowText = readFileSync('.github/workflows/scheduled-prompts.yml', 'utf8')
const workflow = load(workflowText) as Workflow
const scheduledPromptTemplate = readFileSync('docs/prompts/automation/scheduled-prompt.md', 'utf8')

describe('scheduled-prompts workflow', () => {
  it('runs on a schedule (with valid cron entries) and remains manually dispatchable', () => {
    expect(workflow.on?.schedule?.length).toBeGreaterThan(0)
    for (const entry of workflow.on?.schedule ?? []) {
      expect(entry.cron).toMatch(/^\S+\s+\S+\s+\S+\s+\S+\s+\S+$/)
    }
    expect(workflow.on?.workflow_dispatch?.inputs).toHaveProperty('prompt_file')
  })

  it('declares permissions and non-cancelling concurrency', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.jobs?.dispatch?.permissions).toEqual({ contents: 'read' })
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(false)
  })

  it('selects prompts dynamically and validates manual prompt paths', () => {
    const selectJob = workflow.jobs?.['select-prompt']
    const selectStep = selectJob?.steps?.find(step => step.id === 'select')
    const renderStep = selectJob?.steps?.find(step => step.id === 'render')

    expect(selectJob?.['runs-on']).toEqual(['self-hosted'])
    expect(selectStep?.env?.['REQUESTED_PROMPT']).toBe('${{ inputs.prompt_file }}')
    expect(selectStep?.run).toContain('docs/prompts/scheduled/*.md')
    expect(selectStep?.run).toContain('shopt -s nullglob')
    expect(selectStep?.run).toContain('PROMPTS=()')
    expect(selectStep?.run).toContain('[[ -f "$prompt" ]] && PROMPTS+=("$prompt")')
    expect(selectStep?.run).not.toContain('mapfile')
    expect(selectStep?.run).not.toContain('readarray')
    expect(selectStep?.run).toContain('(RUN_NUMBER - 1) % PROMPT_COUNT')
    expect(selectStep?.run).not.toContain('uuidgen')
    expect(selectStep?.run).not.toContain('prompt_body')
    expect(selectStep?.run).toContain('prompt_path=$PROMPT_PATH')
    expect(selectStep?.run).toContain('Prompt file does not exist')
    expect(selectJob?.outputs).not.toHaveProperty('prompt_body')
    expect(renderStep?.uses).toContain('jonathanong/auto-harness/actions/harness-render-prompt@')
    expect(renderStep?.with?.['template']).toContain('docs/prompts/automation/scheduled-prompt.md')
    expect(renderStep?.with?.['var-files']).toContain(
      'PROMPT_BODY=${{ steps.select.outputs.prompt_path }}',
    )
  })

  it('runs prompt selection through system bash without Bash 4 helpers', () => {
    const selectStep = workflow.jobs?.['select-prompt']?.steps?.find(step => step.id === 'select')
    expect(selectStep?.run).toBeTruthy()

    const cwd = mkdtempSync(join(tmpdir(), 'scheduled-prompts-'))
    const outputFile = join(cwd, 'github-output.txt')
    const promptDir = join(cwd, 'docs', 'prompts', 'scheduled')
    const binDir = join(cwd, 'bin')

    try {
      mkdirSync(promptDir, { recursive: true })
      mkdirSync(binDir)
      mkdirSync(join(promptDir, '00-directory.md'))
      writeFileSync(join(promptDir, '01-alpha.md'), 'alpha prompt\n')
      writeFileSync(join(promptDir, '02-beta.md'), 'beta prompt\n')

      execFileSync('/bin/bash', ['-c', selectStep?.run ?? ''], {
        cwd,
        env: {
          ...process.env,
          GITHUB_OUTPUT: outputFile,
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
          REQUESTED_PROMPT: '',
          RUN_NUMBER: '2',
        },
      })

      expect(readFileSync(outputFile, 'utf8')).toBe(
        [
          'prompt_path=docs/prompts/scheduled/02-beta.md',
          'prompt_name=02-beta.md',
          'completion_mode=pr',
          'existing_issue_maintenance=false',
          '',
        ].join('\n'),
      )
    } finally {
      rmSync(cwd, { recursive: true, force: true })
    }
  })

  it('relies on the concurrency-id dedup primitive rather than a job-level skip gate', () => {
    expect(workflow.jobs?.['check-duplicates']).toBeUndefined()

    const dispatchJob = workflow.jobs?.['dispatch']
    expect(dispatchJob?.needs).toEqual(['select-prompt'])
    expect(dispatchJob?.if).toBe("always() && needs.select-prompt.result == 'success'")
    expect(dispatchJob?.if).not.toContain('.outputs.skip')
  })

  it('dispatches through the reusable Codex workflow', () => {
    const dispatchJob = workflow.jobs?.['dispatch']

    expect(dispatchJob?.needs).toContain('select-prompt')
    expect(dispatchJob?.uses).toBe('./.github/workflows/harness-dispatch.yml')
    expect(dispatchJob?.secrets).toEqual({ HARNESS_API_KEY: '${{ secrets.HARNESS_API_KEY }}' })
    expect(dispatchJob?.with?.['publish-duplicate-key']).toContain('Automation scheduled:')
    expect(dispatchJob?.with?.['agent-ref']).toBe('${{ github.sha }}')
    expect(dispatchJob?.with?.['concurrency-id']).toContain('scheduled:')
  })

  it('passes the rendered scheduled prompt to dispatch', () => {
    const selectJob = workflow.jobs?.['select-prompt']
    const setupStep = selectJob?.steps?.find(step => step.uses?.endsWith('/setup-node-pnpm'))
    const dispatchJob = workflow.jobs?.['dispatch']
    const prompt = dispatchJob?.with?.['prompt'] as string

    expect(setupStep).toBeDefined()
    expect(prompt).toBe('${{ needs.select-prompt.outputs.prompt }}')
  })

  it('routes issue-mode prompts through the issue template without PR deduplication', () => {
    const selectJob = workflow.jobs?.['select-prompt']
    const selectStep = selectJob?.steps?.find(step => step.id === 'select')
    const renderStep = selectJob?.steps?.find(step => step.id === 'render')
    const dispatchJob = workflow.jobs?.['dispatch']

    expect(selectJob?.outputs?.['completion_mode']).toBe(
      '${{ steps.select.outputs.completion_mode }}',
    )
    expect(selectStep?.run).toContain('harness-scheduled-completion: issue')
    expect(selectStep?.run).toContain("COMPLETION_MODE='issue'")
    expect(selectStep?.run).toContain('harness-scheduled-scope: existing-issues')
    expect(selectJob?.outputs?.['existing_issue_maintenance']).toBe(
      '${{ steps.select.outputs.existing_issue_maintenance }}',
    )
    expect(renderStep?.with?.['template']).toContain('scheduled-issue.md')
    expect(dispatchJob?.if).toBe("always() && needs.select-prompt.result == 'success'")
    expect(dispatchJob?.with?.['completion-mode']).toBe(
      '${{ needs.select-prompt.outputs.completion_mode }}',
    )
    expect(dispatchJob?.with?.['existing-issue-maintenance']).toBe(
      "${{ needs.select-prompt.outputs.existing_issue_maintenance == 'true' }}",
    )
  })

  it('passes automation:scheduled label to dispatch so created PRs are discoverable by label', () => {
    const dispatchJob = workflow.jobs?.['dispatch']
    expect(dispatchJob?.with?.['pr-label']).toBe('automation:scheduled')
    expect(scheduledPromptTemplate).toContain('`automation`')
    expect(scheduledPromptTemplate).toContain('`automation:scheduled`')
  })

  it('keeps PR-mode publication bounded to one draft PR', () => {
    const dispatch = workflow.jobs?.['dispatch']?.with ?? {}

    expect(dispatch['publish-contract']).toBe(
      "${{ needs.select-prompt.outputs.completion_mode == 'pr' && 'scheduled' || 'none' }}",
    )
    expect(scheduledPromptTemplate).toContain('{{RUN_URL}}')
    expect(scheduledPromptTemplate).not.toContain('codex-completion.json')
    expect(scheduledPromptTemplate).not.toContain('trusted publisher')
    expect(dispatch['pr-recovery-enabled']).toBeUndefined()
  })
})
