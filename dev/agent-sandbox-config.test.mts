import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// This test is the mechanical guard (three-surface consistency + narrowness). For the rationale
// behind which command families stay excluded vs. sandboxed — why gh/docker/pnpm/mutating-git need
// the OS-sandbox bypass, and why read-only git is deliberately left excluded too — see
// docs/development/agent-sandbox.md.

const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const claudeSettings = JSON.parse(repoFile('.claude/settings.json')) as {
  permissions: { allow: string[] }
  sandbox: { excludedCommands: string[]; filesystem: { allowWrite: string[] } }
}
const codexRules = repoFile('.codex/rules/default.rules')
const agentWorkflowBeforePushing = repoFile('.agents/skills/agent-workflow/before-pushing.md')
const agentWorkflowStartOfWork = repoFile('.agents/skills/agent-workflow/start-of-work.md')
const impactDiscovery = repoFile('.agents/skills/planning/references/impact-discovery.md')
const workspaceWriteCacheRoots = [
  '~/Library/Caches/no-mistakes',
  '~/Library/Caches/pnpm',
  '~/.pnpm-state',
  '~/.cache/no-mistakes',
  '~/.cache/pnpm',
  '~/.local/state/pnpm',
]

const codexRuleFor = (pattern: string[]) =>
  `prefix_rule(pattern=${JSON.stringify(pattern).replaceAll(',', ', ')}, decision="allow")`

function tomlSection(source: string, heading: string): string {
  const lines = source.split('\n')
  const start = lines.findIndex(line => line.trim() === heading)
  if (start < 0) return ''
  const body: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.trim().startsWith('[')) break
    body.push(line)
  }
  return body.join('\n')
}

// Only multiline `key = [` arrays. Inline `key = ["…"]` is not parsed.
function tomlQuotedArray(section: string, key: string): string[] {
  const heading = `${key} = [`
  const lines = section.split('\n')
  const start = lines.findIndex(line => line.trim() === heading)
  if (start < 0) return []
  const values: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (line.includes(']')) break
    const match = /^\s*"([^"]+)"\s*,?\s*$/.exec(line)
    if (match) values.push(match[1])
  }
  return values
}

describe('agent sandbox configuration', () => {
  // The Claude review-skip for dev/ commands (the blanket rules plus a narrow allow rule for each
  // dev/ entry below) is pinned in claude-settings-dev-allow.test.mts; these tests cover only OS
  // escalation and Codex.
  it('excludes all official dev/ scripts from the Claude sandbox and pre-approves them in Codex', () => {
    const scripts = [
      './dev/initialize',
      './dev/tmux',
      './dev/tmux-name',
      './dev/tmux-agent-reminder',
      './dev/stop-services',
      './dev/status',
      './dev/reset',
      './dev/reset-worktree',
      './dev/teardown',
      './dev/cleanup',
      './dev/unstick-locks',
      './dev/valkey-logs',
    ]
    for (const script of scripts) {
      const excludedCommands = claudeSettings.sandbox.excludedCommands
      expect(excludedCommands).toContain(script)
      expect(excludedCommands).toContain(`${script} *`)
      expect(codexRules).toContain(codexRuleFor([script]))
    }
  })

  it('does not allow broad bare git/gh sandbox bypasses', () => {
    expect(codexRules).not.toContain(codexRuleFor(['git']))
    expect(codexRules).not.toContain(codexRuleFor(['gh']))
    expect(codexRules).not.toContain(codexRuleFor(['rtk']))
  })

  it('allows the specific npx tool invocations used by the local dev loop', () => {
    const npxTools = ['pr-shepherd', 'vitest', 'oxlint', 'oxfmt', 'no-mistakes']
    for (const tool of npxTools) {
      const allow = claudeSettings.permissions.allow
      const excludedCommands = claudeSettings.sandbox.excludedCommands
      expect(allow).toContain(`Bash(npx ${tool} *)`)
      expect(excludedCommands).toContain(`npx ${tool} *`)
      expect(codexRules).toContain(codexRuleFor(['npx', tool]))
    }
  })

  it('does not allow a broad bare npx sandbox bypass', () => {
    expect(claudeSettings.permissions.allow).not.toContain('Bash(npx *)')
    expect(claudeSettings.sandbox.excludedCommands).not.toContain('npx *')
    expect(codexRules).not.toContain(codexRuleFor(['npx']))
  })

  it('keeps the remaining git/gh prefixes', () => {
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

  it('does not pre-approve the review-bypass git/gh families removed from Claude allow', () => {
    for (const pattern of [
      ['git', 'rebase'],
      ['git', 'stash'],
      ['git', 'cherry-pick'],
      ['gh', 'run'],
      ['gh', 'api'],
      ['gh', 'workflow'],
    ]) {
      const normalizedRules = codexRules.replace(/\s+/g, ' ')
      expect(normalizedRules).not.toContain(codexRuleFor(pattern))
    }
  })

  it('documents pnpm approval prefixes', () => {
    for (const content of [agentWorkflowBeforePushing, agentWorkflowStartOfWork]) {
      for (const prefix of ['["pnpm", "run"]', '["pnpm", "exec"]', '["pnpm", "--dir"]']) {
        expect(content.includes(prefix) || content.includes(prefix.replaceAll('"', '\\"'))).toBe(
          true,
        )
      }
    }
    expect(agentWorkflowStartOfWork).toContain('["no-mistakes"]')
    expect(agentWorkflowStartOfWork).toContain('node_modules/.bin')
    expect(agentWorkflowStartOfWork).toContain('serially')
    expect(impactDiscovery).toContain('node_modules/.bin')
  })

  it('allows the bare pr-shepherd CLI invocation across all three surfaces', () => {
    expect(claudeSettings.permissions.allow).toContain('Bash(pr-shepherd *)')
    expect(claudeSettings.sandbox.excludedCommands).toContain('pr-shepherd *')
    expect(codexRules).toContain(codexRuleFor(['pr-shepherd']))
    expect(claudeSettings.permissions.allow).toContain('Bash(no-mistakes)')
    expect(claudeSettings.permissions.allow).toContain('Bash(no-mistakes *)')
    expect(claudeSettings.permissions.allow).toContain('Bash(pnpm exec no-mistakes *)')
    expect(claudeSettings.sandbox.excludedCommands).toContain('no-mistakes')
    expect(claudeSettings.sandbox.excludedCommands).toContain('no-mistakes *')
    expect(codexRules).toContain(codexRuleFor(['no-mistakes']))
  })

  it('allows the required agent-blackboard snapshot commands in Claude', () => {
    expect(claudeSettings.permissions.allow).toContain(
      'Bash(pnpm exec agent-blackboard snapshot partition *)',
    )
    expect(claudeSettings.permissions.allow).toContain(
      'Bash(pnpm exec agent-blackboard snapshot cleanup *)',
    )
  })

  it('excludes the pr-description and plan-issue dev scripts from the Claude sandbox and allows them in Codex', () => {
    const scripts = ['dev/pr-description.mts', 'dev/plan-issue.mts']
    for (const script of scripts) {
      const excludedCommands = claudeSettings.sandbox.excludedCommands
      expect(excludedCommands).toContain(`node ${script}`)
      expect(excludedCommands).toContain(`node ${script} *`)
      expect(codexRules).toContain(codexRuleFor(['node', script]))
    }
  })

  it('allows `ps aux` process introspection across all three surfaces', () => {
    expect(claudeSettings.permissions.allow).toContain('Bash(ps aux)')
    expect(claudeSettings.permissions.allow).toContain('Bash(ps aux *)')
    expect(claudeSettings.sandbox.excludedCommands).toContain('ps aux')
    expect(claudeSettings.sandbox.excludedCommands).toContain('ps aux *')
    expect(codexRules).toContain(codexRuleFor(['ps', 'aux']))
  })

  it('grants macOS /tmp and /var write roots under their resolved /private paths too', () => {
    const allowWrite = claudeSettings.sandbox.filesystem.allowWrite
    const symlinkedRoots = allowWrite.filter(root => /^\/(?:tmp|var)(?:\/|$)/u.test(root))

    expect(symlinkedRoots).toContain('/tmp')
    for (const root of symlinkedRoots) expect(allowWrite).toContain(`/private${root}`)
  })

  it('allows the pnpm install and test families across the Claude sandbox and Codex', () => {
    const excludedCommands = claudeSettings.sandbox.excludedCommands
    for (const command of ['pnpm install', 'pnpm test']) {
      expect(excludedCommands).toContain(command)
      expect(excludedCommands).toContain(`${command} *`)
    }
    for (const pattern of [
      ['pnpm', 'install'],
      ['pnpm', 'test'],
    ]) {
      expect(codexRules).toContain(codexRuleFor(pattern))
    }
  })
})

describe('Cursor workspace-write sandbox roots', () => {
  it('includes every Codex workspace-write writable root', () => {
    const sandbox = JSON.parse(repoFile('.cursor/sandbox.json')) as {
      additionalReadwritePaths: string[]
      networkPolicy: { default: string }
      type: string
    }
    const codexRoots = tomlQuotedArray(
      tomlSection(repoFile('.codex/config.toml'), '[sandbox_workspace_write]'),
      'writable_roots',
    )

    expect(sandbox.type).toBe('workspace_readwrite')
    expect(sandbox.networkPolicy.default).toBe('allow')
    expect(codexRoots.length).toBeGreaterThan(0)
    expect(sandbox.additionalReadwritePaths).toEqual(codexRoots)
    const cli = JSON.parse(repoFile('.cursor/cli.json')) as { permissions: { allow: string[] } }
    expect(cli.permissions.allow).toContain('Shell(no-mistakes)')
    expect(cli.permissions.allow).toContain('Shell(pr-shepherd)')
  })

  it('does not clone Claude excludedCommands into the Cursor sandbox', () => {
    const source = repoFile('.cursor/sandbox.json')
    expect(source).not.toContain('excludedCommands')
    expect(source).not.toContain('pnpm exec')
    expect(source).not.toContain('git *')
  })

  it('ignores Cursor worktree runtime state', () => {
    expect(repoFile('.gitignore')).toContain('.cursor/worktrees')
  })
})

describe('Cursor worktrees config', () => {
  it('uses a setup-worktree command array, not a unix script-path array', () => {
    const config = JSON.parse(repoFile('.cursor/worktrees.json')) as {
      'setup-worktree'?: unknown
      'setup-worktree-unix'?: unknown
    }

    expect(config['setup-worktree-unix']).toBeUndefined()
    expect(config['setup-worktree']).toEqual(['./dev/initialize monorepo'])
  })
})

// Cursor and Grok load .claude/settings.json through Claude-compat; a native hook file double-fires.
describe('agent hook sources', () => {
  it.each(['.cursor/hooks.json', '.grok/hooks'])('has no native %s', hookSource => {
    expect(existsSync(new URL(`../${hookSource}`, import.meta.url))).toBe(false)
  })
})

describe('Grok workspace-write sandbox roots', () => {
  it('includes every Codex workspace-write writable root', () => {
    const grokSection = tomlSection(repoFile('.grok/sandbox.toml'), '[profiles.workspace-write]')
    const grokRoots = tomlQuotedArray(grokSection, 'read_write')
    const codexRoots = tomlQuotedArray(
      tomlSection(repoFile('.codex/config.toml'), '[sandbox_workspace_write]'),
      'writable_roots',
    )

    expect(grokSection).toMatch(/^extends\s*=\s*"workspace"\s*$/m)
    expect(codexRoots.length).toBeGreaterThan(0)
    expect(grokRoots).toEqual(codexRoots)
    expect(codexRoots).not.toContain('~/Library/Caches')
    for (const root of workspaceWriteCacheRoots) {
      expect(codexRoots).toContain(root)
    }
    const allowWrite = claudeSettings.sandbox.filesystem.allowWrite
    for (const root of codexRoots) {
      expect(allowWrite).toContain(root)
    }
  })

  it('does not clone Claude excludedCommands into the Grok profile', () => {
    const grokSource = repoFile('.grok/sandbox.toml')
    expect(grokSource).not.toContain('excludedCommands')
    expect(grokSource).not.toContain('pnpm exec')
    expect(grokSource).not.toContain('git *')
  })
})
