import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Host runtime policy (sandbox mode, network, credential filtering, generic exclusions, approvals,
// models, status line) is user-level config written by vouchington-machines
// `configure-agents.sh`. Checked-in agent config keeps only project policy: hooks, semantic denies,
// narrow project allows, MCP/plugin wiring, and exclusions for this repository's own dev/ scripts.
// This guard keeps those two owners apart. Rationale: docs/development/agent-sandbox.md.

const MACHINES_CONTRACT =
  'https://github.com/vouchington/vouchington-machines/blob/main/docs/agent-config.md'

const repoUrl = (path: string) => new URL(`../${path}`, import.meta.url)
const repoFile = (path: string) => readFileSync(repoUrl(path), 'utf8')
const repoHas = (path: string) => existsSync(repoUrl(path))

const claudeSettings = JSON.parse(repoFile('.claude/settings.json')) as {
  permissions: { allow: string[] }
  sandbox: { excludedCommands: string[] }
}
const codexConfig = repoFile('.codex/config.toml')
const codexRules = repoFile('.codex/rules/default.rules')

const CLAUDE_HOST_KEYS = [
  'sandbox.enabled',
  'sandbox.failIfUnavailable',
  'sandbox.filesystem',
  'sandbox.network',
  'sandbox.credentials',
  'permissions.defaultMode',
  'autoMode',
  'effortLevel',
  'advisorModel',
  'statusLine',
  'model',
]

const CODEX_HOST_KEY =
  /^\s*(?:model|model_reasoning_effort|plan_mode_reasoning_effort|sandbox_mode|approval_policy|approvals_reviewer)\s*=/mu
const CODEX_SANDBOX_TABLE = /^\s*\[\[?\s*sandbox/mu
const GROK_SANDBOX_TABLE = /^\s*\[\s*sandbox/mu

function hasPath(value: unknown, path: string): boolean {
  let current = value
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null || !(key in current)) return false
    current = (current as Record<string, unknown>)[key]
  }
  return true
}

const claudeHostKeys = (settings: unknown) => CLAUDE_HOST_KEYS.filter(k => hasPath(settings, k))

// A project exclusion lifts the machine's OS sandbox for one command, so it may name only this
// repository's checked-in scripts. Generic tools belong to the machine policy.
const nonProjectExclusions = (excluded: string[]) =>
  excluded.filter(command => !/^(?:\.\/dev\/|node dev\/)/u.test(command) || command.includes('..'))

// Each exclusion is an exact command plus a trailing-wildcard twin, so arguments stay excluded.
const unpairedExclusions = (excluded: string[]) =>
  excluded.filter(command => !command.endsWith(' *') && !excluded.includes(`${command} *`))

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

function claudeExclusionCoversPrefix(exclusion: string, prefix: string): boolean {
  if (!exclusion.endsWith(' *')) return false
  const command = exclusion.slice(0, -2)
  return !command.includes('*') && (prefix === command || prefix.startsWith(`${command} `))
}

// A Codex prefix also allows appended arguments, so only a Claude trailing-wildcard exclusion
// gives the same containment.
const unmatchedCodexAllows = (source: string, excluded: string[]) =>
  codexAllowPrefixes(source).filter(
    prefix => !excluded.some(exclusion => claudeExclusionCoversPrefix(exclusion, prefix)),
  )

const nonDevCodexAllows = (source: string) =>
  codexAllowPrefixes(source).filter(prefix => !/^(?:\.\/dev\/|node dev\/)/u.test(prefix))

describe('Claude project settings', () => {
  it('leave host runtime policy to the machine user settings', () => {
    expect(claudeHostKeys(claudeSettings)).toEqual([])
    expect(Object.keys(claudeSettings.sandbox)).toEqual(['excludedCommands'])
  })

  it('detects host keys in a project settings fixture', () => {
    const settings = {
      model: 'm',
      permissions: { defaultMode: 'auto' },
      sandbox: { enabled: true, failIfUnavailable: true, network: {} },
    }
    expect(claudeHostKeys(settings)).toEqual([
      'sandbox.enabled',
      'sandbox.failIfUnavailable',
      'sandbox.network',
      'permissions.defaultMode',
      'model',
    ])
  })

  it('exclude only this repository dev/ scripts from the sandbox', () => {
    const { excludedCommands } = claudeSettings.sandbox
    expect(excludedCommands.length).toBeGreaterThan(0)
    expect(nonProjectExclusions(excludedCommands)).toEqual([])
    expect(unpairedExclusions(excludedCommands)).toEqual([])
  })

  it('name an existing script for every exclusion', () => {
    const missing = claudeSettings.sandbox.excludedCommands.filter(
      command =>
        !command.endsWith(' *') && !repoHas(command.replace(/^node /u, '').replace(/^\.\//u, '')),
    )
    expect(missing).toEqual([])
  })

  it('reject generic tools and parent-directory escapes as project exclusions', () => {
    const rejected = ['git *', 'pnpm exec *', 'gh *', './dev/../bin/sh', 'node dev/../x.mts *']
    expect(
      nonProjectExclusions(['./dev/status', 'node dev/pr-description.mts *', ...rejected]),
    ).toEqual(rejected)
    expect(unpairedExclusions(['./dev/status', './dev/tmux', './dev/tmux *'])).toEqual([
      './dev/status',
    ])
  })

  it('keep no broad bare npx or git allow in the project', () => {
    expect(claudeSettings.permissions.allow).not.toContain('Bash(npx *)')
    expect(claudeSettings.permissions.allow).not.toContain('Bash(git *)')
    expect(claudeSettings.permissions.allow).not.toContain('Bash(gh *)')
  })
})

describe('Codex project config', () => {
  it('leaves model, sandbox, and approval policy to the machine user config', () => {
    expect(codexConfig).not.toMatch(CODEX_HOST_KEY)
    expect(codexConfig).not.toMatch(CODEX_SANDBOX_TABLE)
    expect('model = "m"\n[sandbox_workspace_write]').toMatch(CODEX_HOST_KEY)
    expect('[sandbox_workspace_write]').toMatch(CODEX_SANDBOX_TABLE)
  })

  it('keeps one rules source', () => {
    const ruleFiles = readdirSync(repoUrl('.codex/rules/'))
      .filter(path => path.endsWith('.rules'))
      .toSorted()
    expect(ruleFiles).toEqual(['default.rules'])
  })

  it('allows only dev/ prefixes, each covered by a Claude project exclusion', () => {
    expect(codexAllowPrefixes(codexRules).length).toBeGreaterThan(0)
    expect(nonDevCodexAllows(codexRules)).toEqual([])
    expect(unmatchedCodexAllows(codexRules, claudeSettings.sandbox.excludedCommands)).toEqual([])
  })

  it('rejects a Codex-only bypass and a non-dev prefix', () => {
    const rules = `${codexRuleFor(['./dev/status'])}\n${codexRuleFor(['pnpm', 'dlx'])}`
    expect(unmatchedCodexAllows(rules, ['./dev/status *'])).toEqual(['pnpm dlx'])
    expect(nonDevCodexAllows(rules)).toEqual(['pnpm dlx'])
  })

  it('requires trailing wildcards at command boundaries', () => {
    const rules = [['node', 'dev/example.mts'], ['./dev/tmux'], ['./dev/tmux-name'], ['./dev/x']]
      .map(codexRuleFor)
      .join('\n')
    expect(
      unmatchedCodexAllows(rules, ['node dev/example.mts', './dev/tmux *', './dev/*']),
    ).toEqual(['node dev/example.mts', './dev/tmux-name', './dev/x'])
  })

  it('parses every rule and fails closed on unsupported prefix syntax', () => {
    expect(
      codexAllowPrefixes(
        '# comment\n prefix_rule( pattern = ["./dev/status"], decision = "allow" ) # comment\nprefix_rule(pattern=["git"], decision="forbidden")\n',
      ),
    ).toEqual(['./dev/status'])
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
})

describe('Cursor and Grok project config', () => {
  it.each(['.cursor/sandbox.json', '.grok/sandbox.toml'])(
    'has no project sandbox profile %s',
    file => {
      expect(repoHas(file)).toBe(false)
    },
  )

  it('has no project sandbox table or Shell allow', () => {
    expect(repoFile('.grok/config.toml')).not.toMatch(GROK_SANDBOX_TABLE)
    for (const file of ['.cursor/cli.json', '.cursor/permissions.json']) {
      expect(repoFile(file)).not.toContain('Shell(no-mistakes')
      expect(repoFile(file)).not.toContain('allow_instructions')
    }
    const cli = JSON.parse(repoFile('.cursor/cli.json')) as { permissions: { allow: string[] } }
    expect(cli.permissions.allow.filter(rule => !rule.startsWith('Mcp('))).toEqual([])
  })

  // Cursor and Grok load .claude/settings.json hooks through Claude-compat; a native hook file
  // double-fires them.
  it.each(['.cursor/hooks.json', '.grok/hooks'])('has no native %s', hookSource => {
    expect(repoHas(hookSource)).toBe(false)
  })

  it('uses a setup-worktree command array and ignores Cursor worktree runtime state', () => {
    const config = JSON.parse(repoFile('.cursor/worktrees.json')) as Record<string, unknown>
    expect(config['setup-worktree-unix']).toBeUndefined()
    expect(config['setup-worktree']).toEqual(['./dev/initialize monorepo'])
    expect(repoFile('.gitignore')).toContain('.cursor/worktrees')
  })
})

describe('ownership documentation', () => {
  it.each([
    'docs/development/agent-sandbox.md',
    'docs/development/reference-agent-sandbox-credential-deny-list.md',
  ])('%s links the machines contract', doc => {
    expect(repoFile(doc)).toContain(MACHINES_CONTRACT)
  })
})
