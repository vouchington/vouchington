import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Workspace roots and hook wiring complement the command-bypass guard in
// agent-sandbox-config.test.mts. Rationale: docs/development/agent-sandbox.md.
const repoFile = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const claudeSettings = JSON.parse(repoFile('.claude/settings.json')) as {
  sandbox: { filesystem: { allowWrite: string[] } }
}
const workspaceWriteCacheRoots = [
  '~/Library/Caches/no-mistakes',
  '~/Library/Caches/pnpm',
  '~/.pnpm-state',
  '~/.cache/no-mistakes',
  '~/.cache/pnpm',
  '~/.local/state/pnpm',
]

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
