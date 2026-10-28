import { lstatSync, readFileSync, readlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const ADAPTER_NAMES = [
  'agent-workflow',
  'backend-vitest-test-authoring',
  'blackboard',
  'bounded-iteration',
  'git-commit-checklist',
  'github-actions-checklist',
  'github-issue',
  'organize-github-issues',
  'package-json-checklist',
  'planning',
  'playwright-authoring',
  'postgres-node-performance-tuning',
  'postgres-partitioning-uuid-v7',
  'postgres-schema-design',
  'pr-description',
  'retrospective',
  'retrospective-distill',
  'review-ci-logs',
  'review-github-issue-taxonomy',
  'revisit-followups',
  'stacked-prs',
  'static-analysis-checklist',
  'storybook-authoring',
  'vitest-test-authoring',
  'web-vitest-test-authoring',
] as const

describe('Vouchington workflow skill adapters', () => {
  it.each(ADAPTER_NAMES)('%s remains discoverable through its canonical symlink', name => {
    const claudePath = resolve(repoRoot, `.claude/skills/${name}`)

    expect(lstatSync(claudePath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(claudePath)).toBe(`../../.agents/skills/${name}`)
  })

  it('keeps upstream plugin registration out of the project settings', () => {
    const claudeSettings = JSON.parse(
      readFileSync(resolve(repoRoot, '.claude/settings.json'), 'utf8'),
    ) as Record<string, unknown>

    expect(claudeSettings).not.toHaveProperty('enabledPlugins')
    expect(claudeSettings).not.toHaveProperty('extraKnownMarketplaces')
  })
})
