import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const ROOT_URL = new URL('../', import.meta.url)
const readRepoFile = (path: string): string => readFileSync(new URL(path, ROOT_URL), 'utf8')
const normalized = (path: string): string => readRepoFile(path).replace(/\s+/g, ' ')

const TRIAGE_SKILLS = ['triage-prs', 'triage-security'] as const
const packagedTriage = normalized('node_modules/vouchington-tooling/skills/triage-prs/SKILL.md')
const packagedFeedback = normalized(
  'node_modules/vouchington-tooling/skills/triage-prs/references/feedback.md',
)

describe('agent-authored PR creation feedback contract', () => {
  it.each(TRIAGE_SKILLS)(
    'wires %s directly to the canonical rubric and retrospective flow',
    skill => {
      const contents = normalized(`.agents/skills/${skill}/SKILL.md`)

      expect(contents).toContain(
        '[agent-authored PR creation feedback](../agent-workflow/code-review.md#agent-authored-pr-creation-feedback)',
      )
      expect(contents).toContain('[retrospective](../retrospective/SKILL.md)')
    },
  )

  it('retains local feedback authority while the package owns queue procedure', () => {
    const adapter = normalized('.agents/skills/triage-prs/SKILL.md')

    expect(adapter).toContain('vouchington-workflow:triage-prs')
    expect(adapter).toContain('docs/prompts/**')
    expect(adapter).toContain('pr-creation-feedback-origin: triage-prs')
    expect(packagedTriage).toContain('references/feedback.md')
    expect(packagedTriage).toContain('headRefOid')
    expect(packagedFeedback).toContain('duplicate: ambiguous')
    expect(packagedFeedback).toContain('Disposition: preauthorized-pr #N')
    expect(packagedFeedback).toContain('return `none`')
  })

  it('delegates retrospective feedback structure to the canonical workflow and retains local persistence', () => {
    const retrospective = normalized('.agents/skills/retrospective/SKILL.md')

    expect(retrospective).toContain('vouchington-workflow:retrospective')
    expect(retrospective).toContain('retrospective_save')
    expect(retrospective).toContain('[PR feedback](pr-feedback.md)')
  })

  it('records a preauthorized feedback PR disposition without another user prompt', () => {
    const feedback = normalized('.agents/skills/retrospective/pr-feedback.md')

    expect(feedback).toContain('preauthorized-pr')
    expect(feedback).toContain('Disposition: preauthorized-pr #N')
  })

  it('delegates feedback classification to the canonical workflow and retains local issue routing', () => {
    const distill = normalized('.agents/skills/retrospective-distill/SKILL.md')
    const snapshotExportIndex = distill.indexOf('snapshot_export')
    const delegationIndex = distill.indexOf('manifest.schemaVersion === 1')

    expect(distill).toContain('vouchington-workflow:retrospective-distill')
    expect(distill).toContain('[github-issue](../github-issue/SKILL.md)')
    expect(snapshotExportIndex).toBeLessThan(delegationIndex)
    expect(distill).not.toMatch(/nextCursor/i)
    expect(distill).toContain('manifest.schemaVersion === 1')
    expect(distill).toContain('--retro-days')
    expect(distill).toContain('--session-days')
    expect(distill).toContain('selection.inactiveForHours')
    expect(distill).toContain('entry-type-unresolved')
    expect(distill).toContain('[distilling.md](distilling.md)')
  })

  it('keeps retrospective mechanics local without weakening the canonical evidence boundary', () => {
    const retrospective = normalized('.agents/skills/retrospective/SKILL.md')
    const localGuidance = [
      retrospective,
      normalized('.agents/skills/retrospective/fact-contracts.md'),
      normalized('.agents/skills/retrospective/saving.md'),
    ].join(' ')

    expect(retrospective).toContain('vouchington-workflow:retrospective')
    expect(retrospective).toContain('≤10 tool calls, ≤5 minutes, ≤25k tokens')
    expect(retrospective).toContain('`grep`, `rg`, `jq`, or `awk`')
    expect(localGuidance).not.toContain('retrospective-facts --raw')
    expect(localGuidance).not.toMatch(
      /(?:save|persist|store|retain|record|embed|include)\s+(?:any\s+|all\s+|the\s+)?(?:raw|unredacted)\b/i,
    )
  })

  it('wires the feedback loop and leaves shepherd handoff mechanical', () => {
    const prompts = normalized('docs/prompts/README.md')
    const shepherd = normalized('.agents/skills/ready-and-shepherd/SKILL.md')

    expect(prompts).toContain('```mermaid')
    expect(prompts).toContain('docs/prompts/**')
    expect(prompts).toContain('preauthorized-pr')
    expect(shepherd).not.toContain('PR Creation Feedback')
    expect(shepherd).not.toContain('agent-authored PR creation feedback')
  })
})
