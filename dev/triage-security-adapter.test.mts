import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const adapter = readFileSync('.agents/skills/triage-security/SKILL.md', 'utf8')
describe('security-triage plugin adapter', () => {
  it('documents plugin installation, generic boundaries, and all v1 fields', () => {
    const compact = adapter.replace(/\s+/gu, ' ')
    expect(compact).toContain('`security-triage`')
    expect(compact).toContain('0.1.0')
    expect(compact).toContain('vouchington-tooling#install')
    expect(compact).toContain('`canonicalRepository`')
    expect(compact).toContain('`defaultBranch`')
    expect(compact).toContain('`evidenceSha`')
    expect(compact).toContain('`selectedRemote`')
    expect(compact).toContain('`verdict`')
    expect(compact).toContain('`close`')
    expect(compact).toContain('`lower_severity`')
    expect(compact).toContain("disposition: 'grouped_issue'")
    expect(compact).toContain("execution.status: 'proposed'")
    expect(compact).toContain("disposition: 'provider_fix_pr'")
    expect(compact).toContain("execution.status: 'completed'")
    expect(compact).toContain('`providerPullRequest`')
    expect(compact).toContain('`github-issue-agent`')
    expect(compact).toContain('`finding`')
    expect(compact).toContain('`evidence`')
    expect(compact).toContain('`issueCandidate.groupKey`')
    expect(compact).toContain('`ready-and-shepherd`')
    for (const text of ['Playwright', 'mcp__claude-in-chrome', 'gh issue create', 'gh label'])
      expect(adapter).not.toContain(text)
  })
})
