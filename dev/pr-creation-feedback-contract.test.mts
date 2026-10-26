import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const ROOT_URL = new URL('../', import.meta.url)
const readRepoFile = (path: string): string => readFileSync(new URL(path, ROOT_URL), 'utf8')
const normalized = (path: string): string => readRepoFile(path).replace(/\s+/g, ' ')

const TRIAGE_SKILLS = ['triage-prs', 'triage-security'] as const

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

  it('retains local feedback authority', () => {
    const adapter = normalized('.agents/skills/triage-prs/SKILL.md')

    expect(adapter).toContain('vouchington-workflow:triage-prs')
    expect(adapter).toContain('docs/prompts/**')
    expect(adapter).toContain('pr-creation-feedback-origin: triage-prs')
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
