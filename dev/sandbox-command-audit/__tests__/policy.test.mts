import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { isCoveredByPolicy, loadSandboxPolicy } from '../policy.mts'

describe('loadSandboxPolicy', () => {
  let root: string

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
  })

  function writeSettings(settings: unknown): string {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-policy-'))
    const path = join(root, 'settings.json')
    writeFileSync(path, JSON.stringify(settings))
    return path
  }

  it('reduces Bash(...) allow/deny entries and excludedCommands to prefix token sets', () => {
    const path = writeSettings({
      permissions: {
        allow: ['Bash(pnpm *)', 'Bash(git status)', 'WebFetch(domain:example.com)', 'Read(*)'],
        deny: ['Bash(git push *)', 'Bash(rm -rf /)'],
      },
      sandbox: { excludedCommands: ['pnpm exec *', 'pnpm run *', 'git *'] },
    })

    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)

    expect(policy.allowListTokens).toEqual([['pnpm'], ['git', 'status']])
    expect(policy.denyListTokens).toEqual([
      ['git', 'push'],
      ['rm', '-rf', '/'],
    ])
    expect(policy.excludedCommandTokens).toEqual([['pnpm', 'exec'], ['pnpm', 'run'], ['git']])
  })

  it('treats missing permissions/sandbox sections as empty rather than throwing', () => {
    const path = writeSettings({})
    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)
    expect(policy).toEqual({ excludedCommandTokens: [], allowListTokens: [], denyListTokens: [] })
  })

  it('ignores non-string entries in allow/deny/excludedCommands arrays', () => {
    const path = writeSettings({
      permissions: { allow: ['Bash(git status)', 42, null], deny: [true] },
      sandbox: { excludedCommands: [{ nested: true }] },
    })
    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)
    expect(policy.allowListTokens).toEqual([['git', 'status']])
    expect(policy.denyListTokens).toEqual([])
    expect(policy.excludedCommandTokens).toEqual([])
  })

  it('drops a Bash(...)/excludedCommands entry that tokenizes to nothing', () => {
    const path = writeSettings({
      permissions: { allow: ['Bash()', 'Bash(git status)'] },
      sandbox: { excludedCommands: ['   '] },
    })
    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)
    expect(policy.allowListTokens).toEqual([['git', 'status']])
    expect(policy.excludedCommandTokens).toEqual([])
  })

  it('keeps the command text for a wildcard glued directly onto the first token', () => {
    const path = writeSettings({
      permissions: { allow: ['Bash(find:*)', 'Bash(git*)'] },
      sandbox: { excludedCommands: ['grep:*'] },
    })
    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)
    expect(policy.allowListTokens).toEqual([['find'], ['git']])
    expect(policy.excludedCommandTokens).toEqual([['grep']])
  })

  it('keeps the wildcard on a directory glob so it covers every command under it', () => {
    const path = writeSettings({
      permissions: { allow: ['Bash(./dev/*)', 'Bash(node dev/*)'] },
    })
    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)
    expect(policy.allowListTokens).toEqual([['./dev/*'], ['node', 'dev/*']])
  })

  it('keeps a trailing wildcard on a glued glob that appears after the first token', () => {
    const path = writeSettings({
      permissions: { deny: ['Bash(git push +*)', 'Bash(git pull --rebase*)'] },
    })
    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)
    expect(policy.denyListTokens).toEqual([
      ['git', 'push', '+*'],
      ['git', 'pull', '--rebase*'],
    ])
  })

  it('parses a Bash(...) entry with a trailing glob suffix after the closing paren', () => {
    const path = writeSettings({
      permissions: { deny: ['Bash(rm -rf /)*', 'Bash(rm -rf ~)'] },
    })
    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)
    expect(policy.denyListTokens).toEqual([
      ['rm', '-rf', '/'],
      ['rm', '-rf', '~'],
    ])
  })

  it('drops a deny pattern with a trailing literal after the wildcard regardless of prefix length', () => {
    const path = writeSettings({
      permissions: {
        deny: ['Bash(git * -X ours*)', 'Bash(cp * ~/.ssh/*)', 'Bash(git push * --force *)'],
      },
    })
    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)
    expect(policy.denyListTokens).toEqual([])
  })

  it('drops a pattern with a literal after the wildcard inside the same token', () => {
    const path = writeSettings({
      permissions: {
        deny: ['Bash(./dev*/../*)', 'Bash(node dev*/../*)', 'Bash(curl *|bash*)'],
      },
    })
    const policy = loadSandboxPolicy(path)
    if ('error' in policy) throw new Error(`expected a policy, got error: ${policy.error}`)
    expect(policy.denyListTokens).toEqual([])
  })

  it('returns an error when the settings file does not exist', () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-policy-'))
    const result = loadSandboxPolicy(join(root, 'missing.json'))
    expect('error' in result).toBe(true)
  })

  it('returns an error when the settings file is not valid JSON', () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-policy-'))
    const path = join(root, 'settings.json')
    writeFileSync(path, 'not json')
    const result = loadSandboxPolicy(path)
    expect('error' in result).toBe(true)
  })

  it('returns an error rather than throwing when settings.json parses to null', () => {
    const path = writeSettings(null)
    const result = loadSandboxPolicy(path)
    expect('error' in result).toBe(true)
  })

  it('returns an error rather than throwing when settings.json parses to a primitive', () => {
    root = mkdtempSync(join(tmpdir(), 'sandbox-audit-policy-'))
    const path = join(root, 'settings.json')
    writeFileSync(path, '42')
    const result = loadSandboxPolicy(path)
    expect('error' in result).toBe(true)
  })
})

describe('isCoveredByPolicy', () => {
  it('matches when the prefix starts with a policy token sequence', () => {
    expect(isCoveredByPolicy('git status --short', [['git', 'status']])).toBe(true)
  })

  it('does not match on a word-boundary-unsafe substring (gitfoo vs git)', () => {
    expect(isCoveredByPolicy('gitfoo status', [['git']])).toBe(false)
  })

  it('does not match when the candidate is shorter than the policy prefix', () => {
    expect(isCoveredByPolicy('git', [['git', 'status']])).toBe(false)
  })

  it('does not match against an empty policy token set', () => {
    expect(isCoveredByPolicy('git status', [[]])).toBe(false)
  })

  it('returns false when no policy set matches', () => {
    expect(isCoveredByPolicy('curl example.com', [['git'], ['pnpm', 'exec']])).toBe(false)
  })

  it('prefix-matches a policy token ending in a wildcard against the candidate token there', () => {
    expect(isCoveredByPolicy('git push +main', [['git', 'push', '+*']])).toBe(true)
    expect(isCoveredByPolicy('git pull --rebase=false', [['git', 'pull', '--rebase*']])).toBe(true)
  })

  it('does not prefix-match a wildcard policy token against an unrelated candidate token', () => {
    expect(isCoveredByPolicy('git push origin main', [['git', 'push', '+*']])).toBe(false)
  })

  it('covers every command under a directory glob and nothing beside it', () => {
    expect(isCoveredByPolicy('./dev/tmux-name web', [['./dev/*']])).toBe(true)
    expect(isCoveredByPolicy('./devtools/run', [['./dev/*']])).toBe(false)
  })
})
