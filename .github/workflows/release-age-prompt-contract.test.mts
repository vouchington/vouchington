import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('release-age scheduled prompt contract', () => {
  it('makes metadata drift, eligible groups, and orphan selectors independently actionable', () => {
    const text = readFileSync('docs/prompts/scheduled/dependencies.md', 'utf8')

    expect(text).toContain('`temporaryGroups`')
    expect(text).toContain('`pnpm-release-age-policy`')
    expect(text).toContain('`minimumReleaseAge`')
    expect(text).toContain('`pnpm-workspace.yaml`')
    expect(text).toContain('`eligibleForRemovalAt`')
    expect(text).toContain('`pnpm-lock.yaml`')
    expect(text).not.toContain('cleanupIssue')
    expect(text).not.toContain('expiresAt')
  })
})
