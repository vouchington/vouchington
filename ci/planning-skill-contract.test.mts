import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = (path: string) => readFileSync(`${root}/${path}`, 'utf8')

describe('planning skill contract', () => {
  it('keeps the portable skill runtime-neutral and the local plan schema exact', () => {
    const skill = read('.agents/skills/planning/SKILL.md')
    const portableSkill = read('node_modules/vouchington-tooling/skills/planning/SKILL.md')
    const portableSkillWithoutPolicyFilenames = portableSkill.replaceAll('CLAUDE.md', '')
    const template = read('.agents/skills/planning/references/plan-template.md')
    const impact = read('.agents/skills/planning/references/impact-discovery.md')
    const liveBrowser = read('.agents/skills/planning/references/live-browser-preflight.md')
    const metadata = read('.agents/skills/planning/agents/openai.yaml')
    const retrospective = read('.agents/skills/retrospective/SKILL.md')
    expect(skill).toContain('dev/plan-issue.mts validate')
    expect(portableSkillWithoutPolicyFilenames).not.toMatch(
      /Codex|Claude|model|\.codex\/agents|\.claude\/agents/i,
    )
    expect(template.match(/^## /gm)).toHaveLength(13)
    expect(template).toContain('```mermaid')
    expect(template).toContain('| Concern | Before | After |')
    expect(template.match(/^Not applicable:/gm)).toHaveLength(5)
    expect(template).not.toMatch(/<!--[^\n]*Not applicable:/)
    expect(impact).toContain('pnpm exec no-mistakes planning-impact')
    expect(liveBrowser).not.toMatch(/Codex|Claude|model/i)
    expect(metadata).toMatch(/default_prompt: ['"]Use \$planning/)
    expect(retrospective).toContain('## Plan vs Actual')
  })
})
