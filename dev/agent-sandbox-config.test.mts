import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Host runtime policy (sandbox, approvals, models, status line, plugins, MCP servers) belongs to the
// user's agent config, which vouchington-machines writes. This project owns hooks, narrow
// permissions, deny rules, worktree setup, and the sandbox exclusions for its own dev/ scripts; the
// project permissions and Codex rules below are what these guards cover. Rationale:
// docs/development/agent-sandbox.md.

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const repoPathExists = (path: string) => existsSync(new URL(`../${path}`, import.meta.url))

const claudeSettings = JSON.parse(repoFile('.claude/settings.json')) as Record<string, unknown> & {
  permissions: { allow: string[] } & Record<string, unknown>
  sandbox?: { excludedCommands?: string[] } & Record<string, unknown>
}
const codexConfig = repoFile('.codex/config.toml')
const codexRules = repoFile('.codex/rules/default.rules')

const CLAUDE_MACHINE_KEYS = [
  'model',
  'effortLevel',
  'advisorModel',
  'statusLine',
  'useAutoModeDuringPlan',
  'env',
  'enabledPlugins',
  'extraKnownMarketplaces',
  'enabledMcpjsonServers',
  'mcpServers',
]
const CODEX_MACHINE_KEYS = [
  'sandbox_mode',
  'sandbox_workspace_write',
  'default_permissions',
  'permissions',
  'approval_policy',
  'approvals_reviewer',
  'model',
  'model_reasoning_effort',
  'plan_mode_reasoning_effort',
  'model_provider',
  'model_providers',
  'notify',
  'mcp_servers',
  'plugins',
  'marketplaces',
]

// Top-level keys and table roots of a TOML document, enough to see whether a key is present.
function tomlRoots(source: string): string[] {
  const roots = new Set<string>()
  for (const line of source.split('\n')) {
    const table = /^\s*\[\[?\s*([A-Za-z0-9_-]+)/u.exec(line)
    const key = /^([A-Za-z0-9_-]+)\s*=/u.exec(line)
    const root = table?.[1] ?? key?.[1]
    if (root) roots.add(root)
  }
  return [...roots]
}

const codexRuleFor = (pattern: string[]) =>
  `prefix_rule(pattern=${JSON.stringify(pattern).replaceAll(',', ', ')}, decision="allow")`

function codexAllowPrefixes(source: string): string[] {
  return source.split('\n').flatMap(line => {
    if (!line.trim() || line.trim().startsWith('#')) return []
    const rule =
      /^\s*prefix_rule\(\s*pattern\s*=\s*(\[.*\])\s*,\s*decision\s*=\s*"([^"]+)"\s*\)\s*(?:#.*)?$/u.exec(
        line,
      )
    if (!rule) throw new Error(`Unparsed Codex rule: ${line}`)
    const pattern: unknown = JSON.parse(rule[1])
    if (
      !Array.isArray(pattern) ||
      !pattern.length ||
      !pattern.every(token => typeof token === 'string' && token.length > 0 && !/\s/u.test(token))
    ) {
      throw new Error(`Invalid Codex prefix: ${rule[1]}`)
    }
    return rule[2] === 'allow' ? [pattern.join(' ')] : []
  })
}

describe('host runtime policy stays out of the project', () => {
  it('keeps machine-owned keys out of Claude settings', () => {
    const present = CLAUDE_MACHINE_KEYS.filter(key => key in claudeSettings)
    if ('defaultMode' in claudeSettings.permissions) present.push('permissions.defaultMode')
    expect(present).toEqual([])
  })

  it('keeps only dev/ script exclusions in the Claude sandbox block', () => {
    // The 19 generic exclusions (git, gh, docker, pnpm, npx tools, ps) are machine policy.
    expect(Object.keys(claudeSettings.sandbox ?? {})).toEqual(['excludedCommands'])
    const excluded = claudeSettings.sandbox?.excludedCommands ?? []
    expect(excluded.filter(entry => !/^(?:\.\/dev\/|node dev\/)/u.test(entry))).toEqual([])
  })

  it('keeps machine-owned keys out of Codex config', () => {
    expect(tomlRoots(codexConfig).filter(key => CODEX_MACHINE_KEYS.includes(key))).toEqual([])
  })

  it('has no Cursor or Grok sandbox profile and no native hook source', () => {
    const present = [
      '.cursor/sandbox.json',
      '.grok/sandbox.toml',
      // Cursor and Grok load .claude/settings.json through Claude-compat; a native hook file
      // double-fires.
      '.cursor/hooks.json',
      '.grok/hooks',
    ].filter(repoPathExists)
    expect(present).toEqual([])
  })

  it('keeps sandbox and approval choices out of the Cursor CLI config', () => {
    const cli = JSON.parse(repoFile('.cursor/cli.json')) as Record<string, unknown>
    expect(['sandbox', 'approvalMode', 'model'].filter(key => key in cli)).toEqual([])
  })

  it('tests the key scanner against a fixture', () => {
    expect(
      tomlRoots('# note\nsandbox_mode = "x"\n[sandbox_workspace_write]\n[[hooks.PreToolUse]]\n'),
    ).toEqual(['sandbox_mode', 'sandbox_workspace_write', 'hooks'])
  })
})

describe('Cursor worktree setup', () => {
  it('uses a setup-worktree command array, not a unix script-path array', () => {
    const config = JSON.parse(repoFile('.cursor/worktrees.json')) as {
      'setup-worktree'?: unknown
      'setup-worktree-unix'?: unknown
    }

    expect(config['setup-worktree-unix']).toBeUndefined()
    expect(config['setup-worktree']).toEqual(['./dev/initialize monorepo'])
  })

  it('ignores Cursor worktree runtime state', () => {
    expect(repoFile('.gitignore')).toContain('.cursor/worktrees')
  })
})

describe('Codex project rules', () => {
  it('keeps one mechanically guarded rules source', () => {
    const ruleFiles = readdirSync(new URL('../.codex/rules/', import.meta.url))
      .filter(path => path.endsWith('.rules'))
      .toSorted()
    expect(ruleFiles).toEqual(['default.rules'])
  })

  it('parses every rule and fails closed on unsupported prefix syntax', () => {
    expect(codexAllowPrefixes(codexRules).length).toBeGreaterThan(0)
    expect(
      codexAllowPrefixes(
        '# comment\n prefix_rule( pattern = ["git", "log"], decision = "allow" ) # comment\nprefix_rule(pattern=["git"], decision="forbidden")\n',
      ),
    ).toEqual(['git log'])
    expect(() =>
      codexAllowPrefixes('prefix_rule(pattern=["git"], decision="allow", example=[])'),
    ).toThrow('Unparsed Codex rule')
    expect(() => codexAllowPrefixes('prefix_rule(pattern=[], decision="allow")')).toThrow(
      'Invalid Codex prefix',
    )
    expect(() => codexAllowPrefixes('prefix_rule(pattern=["git log"], decision="allow")')).toThrow(
      'Invalid Codex prefix',
    )
  })

  it('pre-approves each official dev/ script', () => {
    const scripts = [
      './dev/initialize',
      './dev/tmux',
      './dev/tmux-name',
      './dev/tmux-agent-reminder',
      './dev/stop-services',
      './dev/status',
      './dev/rebase-onto-main',
      './dev/reset',
      './dev/reset-worktree',
      './dev/teardown',
      './dev/cleanup',
      './dev/unstick-locks',
      './dev/valkey-logs',
    ]
    for (const script of scripts) expect(codexRules).toContain(codexRuleFor([script]))
    expect(codexRules).toContain(codexRuleFor(['node', 'dev/pr-description.mts']))
  })

  it('does not allow broad bare git, gh, or npx bypasses', () => {
    for (const pattern of [['git'], ['gh'], ['rtk'], ['npx']]) {
      expect(codexRules).not.toContain(codexRuleFor(pattern))
    }
    expect(claudeSettings.permissions.allow).not.toContain('Bash(npx *)')
  })

  it('allows the specific npx tool invocations used by the local dev loop in both agents', () => {
    for (const tool of ['pr-shepherd', 'vitest', 'oxlint', 'oxfmt', 'no-mistakes']) {
      expect(claudeSettings.permissions.allow).toContain(`Bash(npx ${tool} *)`)
      expect(codexRules).toContain(codexRuleFor(['npx', tool]))
    }
  })

  it('keeps the remaining git and gh prefixes', () => {
    for (const pattern of [
      ['git', 'log'],
      ['git', 'fetch'],
      ['git', 'show'],
      ['git', 'diff'],
      ['git', 'status'],
      ['git', 'rev-parse'],
      ['git', 'merge-base'],
      ['git', 'rev-list'],
      ['git', 'branch'],
      ['gh', 'pr'],
      ['gh', 'issue'],
    ]) {
      expect(codexRules).toContain(codexRuleFor(pattern))
    }
  })

  it('does not pre-approve the review-bypass git, gh, or pnpm families', () => {
    const normalizedRules = codexRules.replace(/\s+/g, ' ')
    for (const pattern of [
      ['git', 'rebase'],
      ['git', 'stash'],
      ['git', 'cherry-pick'],
      ['gh', 'run'],
      ['gh', 'api'],
      ['gh', 'workflow'],
      ['pnpm', 'dlx'],
      ['pnpm', '--filter'],
      ['pnpm', '--dir'],
    ]) {
      expect(normalizedRules).not.toContain(codexRuleFor(pattern))
    }
  })

  it('allows the bare pr-shepherd and no-mistakes CLIs in Claude and Codex', () => {
    const allow = claudeSettings.permissions.allow
    expect(allow).toContain('Bash(pr-shepherd *)')
    expect(allow).toContain('Bash(no-mistakes)')
    expect(allow).toContain('Bash(no-mistakes *)')
    expect(allow).toContain('Bash(pnpm exec no-mistakes *)')
    expect(codexRules).toContain(codexRuleFor(['pr-shepherd']))
    expect(codexRules).toContain(codexRuleFor(['no-mistakes']))
  })

  it('allows the agent-blackboard snapshot commands the distill skill runs', () => {
    expect(claudeSettings.permissions.allow).toContain(
      'Bash(pnpm exec agent-blackboard snapshot partition *)',
    )
    expect(claudeSettings.permissions.allow).toContain(
      'Bash(pnpm exec agent-blackboard snapshot cleanup *)',
    )
  })

  it('allows `ps aux` process introspection in Claude and Codex', () => {
    expect(claudeSettings.permissions.allow).toContain('Bash(ps aux)')
    expect(claudeSettings.permissions.allow).toContain('Bash(ps aux *)')
    expect(codexRules).toContain(codexRuleFor(['ps', 'aux']))
  })

  it('allows the pnpm install and test families in Codex', () => {
    for (const pattern of [
      ['pnpm', 'install'],
      ['pnpm', 'test'],
    ]) {
      expect(codexRules).toContain(codexRuleFor(pattern))
    }
  })
})
