import { readFileSync } from 'node:fs'
import { parse as load } from 'yaml'
import { describe, expect, it } from 'vitest'

type WorkflowJob = {
  'runs-on'?: string | string[]
  needs?: string | string[]
  uses?: string
  with?: Record<string, unknown>
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
  jobs?: Record<string, WorkflowJob>
}

const fixMain = readFileSync('.github/workflows/fix-main.yml', 'utf8')
const harnessDispatch = readFileSync('.github/workflows/harness-dispatch.yml', 'utf8')
const parsedMain = load(fixMain) as Workflow
const parsedDispatch = load(harnessDispatch) as Workflow

describe('fix-main duplicate handling', () => {
  it('requires a related-work audit in the dispatch prompt instead of a topic-scoped skip gate', () => {
    const relatedJob = parsedMain.jobs?.['related-candidates']

    expect(relatedJob?.outputs?.['related-candidates']).toBe(
      '${{ steps.prompt-context.outputs.related-candidates }}',
    )
    expect(relatedJob?.outputs).not.toHaveProperty('skip')
    expect(relatedJob?.outputs).not.toHaveProperty('existing-kind')
  })

  it('relies solely on the SHA-scoped concurrency id for dedup, not a job-level skip gate', () => {
    const dispatchJob = parsedMain.jobs?.['dispatch']

    expect(dispatchJob?.with?.['concurrency-id']).toBe(
      'filaments:fix-main:${{ github.event.workflow_run.workflow_id }}:${{ github.event.workflow_run.head_sha }}',
    )
    expect(dispatchJob?.if).not.toContain('.outputs.skip')
    expect(parsedMain.jobs?.['render-prompt']?.if).not.toContain('.outputs.skip')
  })

  it('preserves duplicate completion intent through the direct agent boundary', () => {
    const dispatchJob = parsedMain.jobs?.['dispatch']

    expect(dispatchJob?.with?.['allow-duplicate-issue-completion']).toBe(true)
    expect(dispatchJob?.with?.['publish-duplicate-key']).toContain('Automation fix:')
    expect(dispatchJob?.with?.['publish-related-candidates']).toBe(
      "${{ needs.related-candidates.outputs.related-candidates || '[]' }}",
    )
    expect(Object.keys(parsedDispatch.jobs ?? {})).toEqual(['dispatch'])
  })
})
