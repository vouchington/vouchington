import { readFileSync, readdirSync } from 'node:fs'
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
  if (exclusion.endsWith(' *')) {
    const command = exclusion.slice(0, -2)
    return !command.includes('*') && (prefix === command || prefix.startsWith(`${command} `))
  }
  // A Codex prefix also allows appended arguments. Claude's exact entry covers only the bare
  // command, so the corresponding trailing-wildcard exclusion must exist for full containment.
  return false
}

function unmatchedCodexAllows(source: string, excludedCommands: string[]): string[] {
  return codexAllowPrefixes(source).filter(
    prefix => !excludedCommands.some(exclusion => claudeExclusionCoversPrefix(exclusion, prefix)),
  )
}

describe('agent sandbox configuration', () => {
  it('keeps one mechanically guarded Codex rules source', () => {
    const ruleFiles = readdirSync(new URL('../.codex/rules/', import.meta.url))
      .filter(path => path.endsWith('.rules'))
      .toSorted()
    expect(ruleFiles).toEqual(['default.rules'])
  })

  it('covers every Codex unsandboxed allow with a Claude sandbox exclusion', () => {
    expect(codexAllowPrefixes(codexRules).length).toBeGreaterThan(0)
    expect(unmatchedCodexAllows(codexRules, claudeSettings.sandbox.excludedCommands)).toEqual([])
  })

  it('rejects a deliberate Codex-only sandbox bypass', () => {
    const rules = `${codexRuleFor(['pnpm', 'exec'])}\n${codexRuleFor(['pnpm', 'dlx'])}`
    expect(unmatchedCodexAllows(rules, ['pnpm exec *'])).toEqual(['pnpm dlx'])
  })

  it('requires trailing wildcards at command boundaries', () => {
    const rules = [
      ['node', 'dev/example.mts'],
      ['git', 'log'],
      ['git-log'],
      ['pnpm', 'exec'],
      ['pnpm', 'execute'],
      ['npx', 'vitest'],
    ]
      .map(codexRuleFor)
      .join('\n')
    expect(
      unmatchedCodexAllows(rules, ['node dev/example.mts', 'git *', 'pnpm exec *', 'npx *test']),
    ).toEqual(['node dev/example.mts', 'git-log', 'pnpm execute', 'npx vitest'])
  })

  it('parses every rule and fails closed on unsupported prefix syntax', () => {
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
