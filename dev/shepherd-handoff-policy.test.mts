import { globSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string): string => readFileSync(path, 'utf8')
const guidance = [
  ...globSync('.agents/skills/**/*.md'),
  ...globSync('docs/prompts/**/*.md'),
].toSorted()

describe('shepherd handoff guidance', () => {
  it('has no retired dispatch gates, checkpoints, labels, or skill references', () => {
    expect(guidance.length).toBeGreaterThan(0)
    const banned = [
      'HARNESS_',
      'shepherd-checkpoint',
      'automation:auto-fix',
      'automation:scheduled',
      'ready-and-shepherd',
    ]
    const hits = guidance.flatMap(path =>
      banned.filter(term => read(path).includes(term)).map(term => `${path}: ${term}`),
    )
    expect(hits).toEqual([])
  })

  it('documents shepherding by the author with an optional /shepherd delegation', () => {
    const gitAndPrs = read('.agents/skills/agent-workflow/git-and-prs.md')
    expect(gitAndPrs).toContain('shepherds it with pr-shepherd')
    expect(gitAndPrs).toContain("gh pr comment <N> --body '/shepherd'")
    expect(gitAndPrs).toContain('then stop')
  })

  it('keeps batch triage from posting /shepherd and applies the automation label', () => {
    const triage = read('.agents/skills/triage-prs/SKILL.md')
    expect(triage).toContain('never posts a `/shepherd` comment')
    expect(triage).toContain('--add-label automation')
  })

  it('limits the security-triage handoff to ready and label mutations', () => {
    const text = read('.agents/skills/triage-security/SKILL.md')
    const mutations = text
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^(?:gh pr (?:ready|edit|comment|merge)|gh api -X POST)\b/u.test(line))
    expect(mutations).toEqual([
      'gh pr ready <N> || exit 1',
      'gh pr edit <N> --add-label automation || exit 1',
    ])
  })
})
