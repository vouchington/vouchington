import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8')

const ADAPTERS = {
  'agent-workflow': 'vouchington-workflow',
  'backend-vitest-test-authoring': 'vouchington-testing',
  blackboard: 'vouchington-workflow',
  'git-commit-checklist': 'vouchington-workflow',
  'github-actions-checklist': 'vouchington-workflow',
  'github-issue': 'vouchington-workflow',
  'organize-github-issues': 'vouchington-workflow',
  'package-json-checklist': 'vouchington-workflow',
  planning: 'vouchington-workflow',
  'playwright-authoring': 'vouchington-testing',
  'postgres-node-performance-tuning': 'vouchington-database',
  'postgres-partitioning-uuid-v7': 'vouchington-database',
  'pr-description': 'vouchington-workflow',
  retrospective: 'vouchington-workflow',
  'retrospective-distill': 'vouchington-workflow',
  'review-ci-logs': 'vouchington-workflow',
  'review-github-issue-taxonomy': 'vouchington-workflow',
  'revisit-followups': 'vouchington-workflow',
  'stacked-prs': 'vouchington-workflow',
  'static-analysis-checklist': 'vouchington-workflow',
  'storybook-authoring': 'vouchington-testing',
  'vitest-test-authoring': 'vouchington-testing',
  'web-vitest-test-authoring': 'vouchington-testing',
} as const
const ADAPTER_NAMES = Object.keys(ADAPTERS) as Array<keyof typeof ADAPTERS>

describe('Vouchington workflow skill adapters', () => {
  it('keeps the cross-runtime canonical adapters installed by their approved plugins', () => {
    const approved = [...ADAPTER_NAMES].sort()
    const canonicalAdapters = readdirSync(resolve(repoRoot, '.agents/skills'), {
      withFileTypes: true,
    })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name =>
        read(`.agents/skills/${name}/SKILL.md`).includes('## Canonical skill (required)'),
      )
      .sort()
    const installedSkillsRoot = resolve(repoRoot, 'node_modules/vouchington-tooling/skills')
    const manifest = JSON.parse(read('node_modules/vouchington-tooling/skills/manifest.json')) as {
      skills: Array<{ name: string; plugin: string }>
    }

    expect(canonicalAdapters).toEqual(approved)
    for (const name of ADAPTER_NAMES) {
      const canonicalName =
        name === 'web-vitest-test-authoring' ? 'nextjs-vitest-test-authoring' : name

      expect(manifest.skills.find(skill => skill.name === canonicalName)?.plugin).toBe(
        ADAPTERS[name],
      )
      expect(lstatSync(resolve(installedSkillsRoot, canonicalName, 'SKILL.md')).isFile()).toBe(true)
    }
  })

  it.each(ADAPTER_NAMES)(
    '%s selects the required canonical skill for every supported harness and remains discoverable to Claude',
    name => {
      const adapter = read(`.agents/skills/${name}/SKILL.md`)
      const plugin = ADAPTERS[name]
      const claudePath = resolve(repoRoot, `.claude/skills/${name}`)
      const canonicalName =
        name === 'web-vitest-test-authoring' ? 'nextjs-vitest-test-authoring' : name
      const installedCanonicalSkill = `node_modules/vouchington-tooling/skills/${canonicalName}/SKILL.md`

      expect(adapter).toContain(`${plugin}:${canonicalName}`)
      expect(adapter).toContain(installedCanonicalSkill)
      // Five adapters (github-issue, organize-github-issues, review-github-issue-taxonomy,
      // planning, pr-description) were renamed from "Filaments" to "Vouchington" prose; the rest
      // still say "Filaments additions". Both spellings are the same local-overlay heading.
      expect(adapter).toMatch(
        /Filaments additions|Vouchington additions|Filaments-only SDLC and safety policy/i,
      )
      expect(lstatSync(claudePath).isSymbolicLink()).toBe(true)
      expect(readlinkSync(claudePath)).toBe(`../../.agents/skills/${name}`)
    },
  )

  it('keeps only Filaments issue routing and taxonomy policy in the local adapter', () => {
    const skill = read('.agents/skills/github-issue/SKILL.md')

    expect(skill).toContain('`vouchington/vouchington`')
    expect(skill).toContain('`github-issue-agent`')
    expect(skill).toContain('`#N: title -- url`')
    expect(skill).toContain('`Duplicate of #N: <url>`')
    expect(skill).toContain('`preflight`')
    expect(skill).not.toContain('vouchington/*')
  })

  it('keeps local taxonomy handoffs conditional', () => {
    expect(read('.agents/skills/organize-github-issues/SKILL.md')).toContain(
      '[review-github-issue-taxonomy](../review-github-issue-taxonomy/SKILL.md)',
    )
    expect(read('.agents/skills/review-github-issue-taxonomy/SKILL.md')).toContain(
      '[organize-github-issues](../organize-github-issues/SKILL.md)',
    )
  })

  it.each([
    ['review-ci-logs', ['frequency × impact × diagnosability']],
    ['blackboard', ['## Mandatory journal triggers', '[ -n "${VAR+x}" ]']],
    ['retrospective', ['≤10 tool calls', 'unknown — no journal']],
  ] as const)('%s retains its Filaments-only safety invariants', (name, invariants) => {
    const skill = read(`.agents/skills/${name}/SKILL.md`)

    for (const invariant of invariants) expect(skill).toContain(invariant)
  })

  it('keeps the spawned-child identity contract fail closed', () => {
    const skill = read('.agents/skills/blackboard/SKILL.md')

    expect(skill).toContain('`CODEX_THREAD_ID`')
    expect(skill).toContain('`CLAUDE_CODE_SESSION_ID`')
    expect(skill).toContain('`session_ensure`')
    expect(skill).toContain('--parent-session-id')
    expect(skill).toContain('isValidSessionId')
  })

  it('documents the required upstream plugins for both Claude and Codex', () => {
    const claudeReadme = read('.claude/README.md')
    const codexReadme = read('.codex/README.md')
    const claudeSettings = JSON.parse(read('.claude/settings.json')) as {
      enabledPlugins: Record<string, boolean>
      extraKnownMarketplaces: Record<string, unknown>
    }
    const parity = read('docs/development/agent-harness-parity.md')

    expect(claudeReadme).toContain('claude plugin install vouchington-workflow@vouchington')
    expect(claudeReadme).toContain('claude plugin install vouchington-testing@vouchington')
    expect(claudeReadme).toContain('claude plugin install vouchington-database@vouchington')
    expect(claudeReadme).toContain('claude plugin install security-triage@vouchington')
    expect(claudeReadme).toContain('claude plugin install pr-shepherd@jonathanong')
    expect(claudeReadme).toContain('claude plugin marketplace list')
    expect(claudeReadme).toContain('claude plugin details vouchington-workflow@vouchington')
    expect(claudeReadme).toContain('claude plugin details vouchington-testing@vouchington')
    expect(claudeReadme).toContain('claude plugin details vouchington-database@vouchington')
    expect(claudeReadme).toContain('claude plugin details security-triage@vouchington')
    expect(claudeReadme).toContain('claude plugin details pr-shepherd@jonathanong')
    expect(claudeReadme).toContain('`.claude-plugin`')
    expect(claudeReadme).toContain('`.codex-plugin`')
    expect(codexReadme).toContain('codex plugin add vouchington-workflow@vouchington')
    expect(codexReadme).toContain('codex plugin add vouchington-testing@vouchington')
    expect(codexReadme).toContain('codex plugin add vouchington-database@vouchington')
    expect(codexReadme).toContain('codex plugin add security-triage@vouchington')
    expect(codexReadme).toContain('codex plugin add pr-shepherd@jonathanong')
    expect(claudeSettings.enabledPlugins['vouchington-workflow@vouchington']).toBe(true)
    expect(claudeSettings.enabledPlugins['vouchington-testing@vouchington']).toBe(true)
    expect(claudeSettings.enabledPlugins['vouchington-database@vouchington']).toBe(true)
    expect(claudeSettings.enabledPlugins['security-triage@vouchington']).toBe(true)
    expect(claudeSettings.enabledPlugins['pr-shepherd@jonathanong']).toBe(true)
    expect(claudeSettings.extraKnownMarketplaces.vouchington).toEqual({
      source: { repo: 'vouchington/vouchington-tooling', source: 'github' },
    })
    expect(claudeSettings.extraKnownMarketplaces.jonathanong).toEqual({
      source: { repo: 'jonathanong/pr-shepherd', source: 'github' },
    })
    expect(parity).toContain('vouchington-workflow plugin')
    expect(parity).toContain('vouchington-testing plugin')
    expect(parity).toContain('vouchington-database plugin')
  })
})
