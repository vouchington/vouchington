import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'node:fs'
import { resolve } from 'node:path'

import { readSkillManifest } from 'vouchington-tooling/skill-discovery'
import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')
const read = (path: string): string => readFileSync(resolve(repoRoot, path), 'utf8')

const ADAPTERS = {
  'agent-workflow': 'vouchington-workflow',
  'backend-vitest-test-authoring': 'vouchington-testing',
  blackboard: 'vouchington-workflow',
  'bounded-iteration': 'vouchington-database',
  'git-commit-checklist': 'vouchington-workflow',
  'github-actions-checklist': 'vouchington-workflow',
  'github-issue': 'vouchington-workflow',
  'organize-github-issues': 'vouchington-workflow',
  'package-json-checklist': 'vouchington-workflow',
  planning: 'vouchington-workflow',
  'playwright-authoring': 'vouchington-testing',
  'postgres-node-performance-tuning': 'vouchington-database',
  'postgres-partitioning-uuid-v7': 'vouchington-database',
  'postgres-schema-design': 'vouchington-database',
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
  it('keeps the cross-runtime canonical adapters installed by their approved plugins', async () => {
    const approved = [...ADAPTER_NAMES].toSorted()
    const canonicalAdapters = readdirSync(resolve(repoRoot, '.agents/skills'), {
      withFileTypes: true,
    })
      .filter(entry => entry.isDirectory())
      .map(entry => entry.name)
      .filter(name =>
        read(`.agents/skills/${name}/SKILL.md`).includes('## Canonical skill (required)'),
      )
      .toSorted()
    const installedSkillsRoot = resolve(repoRoot, 'node_modules/vouchington-tooling/skills')
    const manifest = await readSkillManifest(installedSkillsRoot)

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
      expect(adapter).not.toContain('Filaments')
      expect(lstatSync(claudePath).isSymbolicLink()).toBe(true)
      expect(readlinkSync(claudePath)).toBe(`../../.agents/skills/${name}`)
    },
  )

  it('keeps only Vouchington issue routing and taxonomy policy in the local adapter', () => {
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
    ['blackboard', ['[ -n "${VAR+x}" ]']],
    ['retrospective', ['≤10 tool calls', 'unknown — no journal']],
  ] as const)('%s retains its Vouchington-only safety invariants', (name, invariants) => {
    const skill = read(`.agents/skills/${name}/SKILL.md`)

    for (const invariant of invariants) expect(skill).toContain(invariant)
  })

  it('keeps the spawned-child identity contract fail closed', () => {
    const skill = read('.agents/skills/blackboard/SKILL.md')

    expect(skill).toContain('`CODEX_THREAD_ID`')
    expect(skill).toContain('`CLAUDE_CODE_SESSION_ID`')
    expect(skill).toContain('`session_ensure`')
    expect(skill).toContain('`parentSessionId`')
    expect(skill).toContain('isValidSessionId')
  })

  it('documents the machine-installed upstream plugins and declares none in the project', () => {
    const claudeReadme = read('.claude/README.md')
    const codexReadme = read('.codex/README.md')
    const claudeSettings = JSON.parse(read('.claude/settings.json')) as Record<string, unknown>
    const parity = read('docs/development/agent-harness-parity.md')
    const plugins = [
      'vouchington-workflow@vouchington',
      'vouchington-testing@vouchington',
      'vouchington-database@vouchington',
      'security-triage@vouchington',
      'pr-shepherd@jonathanong',
    ]

    for (const plugin of plugins) {
      expect(claudeReadme).toContain(`claude plugin details ${plugin}`)
      expect(claudeReadme).toContain(`claude plugin install ${plugin} --scope user`)
    }
    for (const plugin of plugins.map(name => name.split('@')[0])) {
      expect(codexReadme).toContain(`\`${plugin}\``)
    }
    expect(codexReadme).toContain('install-dependencies.sh')
    expect(codexReadme).not.toContain('codex plugin add')
    expect(codexReadme).not.toContain('codex plugin marketplace add')
    expect(claudeReadme).toContain('claude plugin marketplace list')
    expect(claudeReadme).not.toContain('--scope project')
    expect(claudeReadme).toContain('`.claude-plugin`')
    expect(claudeReadme).toContain('`.codex-plugin`')
    expect(claudeSettings).not.toHaveProperty('enabledPlugins')
    expect(claudeSettings).not.toHaveProperty('extraKnownMarketplaces')
    expect(parity).toContain('vouchington-workflow plugin')
    expect(parity).toContain('vouchington-testing plugin')
    expect(parity).toContain('vouchington-database plugin')
  })
})
