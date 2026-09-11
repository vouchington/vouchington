import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const ROOT_URL = new URL('../../../', import.meta.url)
const readRepoFile = (path: string): string => readFileSync(new URL(path, ROOT_URL), 'utf8')
const normalized = (path: string): string => readRepoFile(path).replace(/\s+/g, ' ')

describe('pr-description skill contract', () => {
  it('documents the summary heading, Mermaid guidance, and the create/update commands', () => {
    const skill = normalized('.agents/skills/pr-description/SKILL.md')

    expect(skill).toContain('**Summary**')
    expect(skill).toMatch(/mermaid/i)
    expect(skill).toMatch(/node dev\/pr-description\.mts create/)
    expect(skill).toMatch(/node dev\/pr-description\.mts update/)
  })

  it('documents the tool-injected provenance lines as mechanically enforced', () => {
    const skill = normalized('.agents/skills/pr-description/SKILL.md')

    expect(skill).toContain('`Agent:`')
    expect(skill).toContain('`Device:`')
    expect(skill).toContain('`Worktree:`')
  })
})
