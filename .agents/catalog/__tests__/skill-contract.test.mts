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

const UPSTREAM_ADAPTERS: Record<string, string> = {
  'agent-workflow': 'skills:agent-workflow',
  'backend-vitest-test-authoring': 'skills:test-authoring',
  'bounded-iteration': 'skills:bounded-iteration',
  'git-commit-checklist': 'skills:git-commit-checklist',
  'github-actions-checklist': 'skills:github-actions-authoring',
  'github-issue': 'skills:github-issue',
  'package-json-checklist': 'skills:package-json-checklist',
  planning: 'skills:planning',
  'playwright-authoring': 'skills:playwright-authoring',
  'postgres-node-performance-tuning': 'skills:postgres-node-performance-tuning',
  'postgres-partitioning-uuid-v7': 'skills:postgres-partitioning-uuid-v7',
  'postgres-schema-design': 'skills:postgres-schema-design',
  'pr-description': 'skills:pr-description',
  'review-ci-logs': 'skills:review-ci-logs',
  'revisit-followups': 'skills:revisit-followups',
  'static-analysis-checklist': 'skills:static-analysis-checklist',
  'storybook-authoring': 'skills:test-authoring',
  'vitest-test-authoring': 'skills:test-authoring',
  'web-vitest-test-authoring': 'skills:test-authoring',
}

describe('Vouchington workflow skill adapters', () => {
  it.each(Object.entries(UPSTREAM_ADAPTERS))(
    '%s names its canonical plugin skill and no node_modules fallback',
    (name, canonical) => {
      const body = readFileSync(resolve(repoRoot, `.agents/skills/${name}/SKILL.md`), 'utf8')

      expect(body).toContain(`\`${canonical}\``)
      expect(body).not.toContain('node_modules/vouchington-tooling')
      expect(body).not.toMatch(/vouchington-(testing|database):/)
    },
  )

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
