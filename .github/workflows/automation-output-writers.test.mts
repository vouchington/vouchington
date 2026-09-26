import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as load } from 'yaml'

type RenderStep = { uses?: string; with?: Record<string, string> }
type Workflow = { jobs?: Record<string, { steps?: RenderStep[] }> }

const mergeAuthorityDoc = 'docs/development/merge-authority.md'

const workflowPaths = readdirSync('.github/workflows')
  .filter(file =>
    [
      'fix-dependabot.yml',
      'fix-issue.yml',
      'fix-main.yml',
      'merge-queue-ejection.yml',
      'plan.yml',
      'scheduled-prompts.yml',
      'shepherd.yml',
    ].includes(file),
  )
  .map(file => join('.github/workflows', file))

const yamlByPath = new Map(workflowPaths.map(path => [path, readFileSync(path, 'utf8')] as const))
const outputWriter = readFileSync('ci/write-github-multiline-output.sh', 'utf8')

describe('automation output writers', () => {
  it('reuses the prompt renderer action at all seven render sites', () => {
    const uses = workflowPaths.flatMap(
      path =>
        yamlByPath
          .get(path)
          ?.match(/uses: jonathanong\/auto-harness\/actions\/harness-render-prompt@/g) ?? [],
    )

    expect(uses).toHaveLength(7)
  })

  it('keeps delimiter generation and prompt rendering out of workflow YAML', () => {
    for (const path of workflowPaths) {
      const text = yamlByPath.get(path) ?? ''
      expect(text).not.toContain('uuidgen')
      expect(text).not.toContain('ci/render-harness-prompt.mts')
      expect(text).not.toMatch(/echo [^\n]*<</)
    }
  })

  it('centralizes every automation multiline output in the shared helper', () => {
    const expectedUses: Record<string, number> = {
      '.github/workflows/fix-issue.yml': 1,
      '.github/workflows/plan.yml': 1,
      '.github/workflows/shepherd.yml': 1,
    }

    for (const path of workflowPaths) {
      const uses = yamlByPath.get(path)?.match(/ci\/write-github-multiline-output\.sh/g) ?? []
      expect(uses).toHaveLength(expectedUses[path] ?? 0)
    }
  })

  it('resolves the shared output writer before workspace dependencies are installed', () => {
    expect(outputWriter).toContain('exec-vouchington-gha.sh')
    expect(outputWriter).toContain('gha-output \\\n  scripts/gha/write-github-multiline-output.sh')
    expect(outputWriter).not.toContain('vouchington-tooling-script.sh')
  })

  it('does not expose the selected scheduled prompt body as an output', () => {
    expect(yamlByPath.get('.github/workflows/scheduled-prompts.yml')).not.toContain('prompt_body')
  })

  it('points every rendered merge guard at the merge-authority policy doc', () => {
    const renderSteps = workflowPaths.flatMap(path =>
      Object.values((load(yamlByPath.get(path) ?? '') as Workflow).jobs ?? {}).flatMap(
        job =>
          job.steps?.filter(step =>
            step.uses?.startsWith('jonathanong/auto-harness/actions/harness-render-prompt@'),
          ) ?? [],
      ),
    )

    expect(renderSteps).toHaveLength(7)
    for (const step of renderSteps)
      expect(step.with?.['merge-authority-doc']).toBe(mergeAuthorityDoc)
    expect(existsSync(mergeAuthorityDoc)).toBe(true)
  })
})
