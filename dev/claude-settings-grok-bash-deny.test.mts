import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Grok Claude-compat applies `.claude/settings.json` Bash allow/deny strings with the
// published matcher in the Grok permissions user guide: prefix is character-for-character
// with no word boundary; a trailing ` *` is prefix-plus-space; a trailing `:*` strips to
// a prefix; otherwise `*` is a whole-command glob. Deny is checked against the whole
// command and every `&&` / `||` / `;` / `|` / newline segment, including `bash -c` payloads.

type ClaudeSettings = {
  permissions: { deny: string[] }
}

const claudeSettings = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../.claude/settings.json'), 'utf8'),
) as ClaudeSettings

function unwrapBash(rule: string): string | undefined {
  const match = /^Bash\((.*)\)$/.exec(rule)
  return match?.[1]
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function grokBashMatches(pattern: string, command: string): boolean {
  const cmd = command.trimStart()
  if (pattern.endsWith(':*')) return cmd.startsWith(pattern.slice(0, -2))
  if (pattern.endsWith(' *') && cmd.startsWith(pattern.slice(0, -1))) return true
  if (!pattern.includes('*') && cmd.startsWith(pattern)) return true
  if (pattern.includes('*') && cmd.startsWith(pattern)) return true
  return new RegExp(`^${escapeRegex(pattern).replaceAll('\\*', '.*')}$`).test(cmd)
}

function commandSegments(command: string): string[] {
  const segments = command
    .split(/\s*(?:&&|\|\||;|\||\n)\s*/)
    .map(segment => segment.trim())
    .filter(Boolean)
  const inline =
    /(?:bash|sh|zsh)\s+(?:-[a-zA-Z]*c[a-zA-Z]*|--command)\s+(?:"([^"]*)"|'([^']*)')/.exec(command)
  const payload = inline?.[1] ?? inline?.[2]
  return payload === undefined ? segments : [...segments, payload]
}

function grokBashDenied(denyRules: string[], command: string): boolean {
  const patterns = denyRules.flatMap(rule => {
    const inner = unwrapBash(rule)
    return inner === undefined ? [] : [inner]
  })
  return [command, ...commandSegments(command)].some(segment =>
    patterns.some(pattern => grokBashMatches(pattern, segment)),
  )
}

const denyRules = claudeSettings.permissions.deny

const sanctionedForceWithLease = [
  'git push --force-with-lease',
  'git push --force-with-lease origin docs/codex-workflow',
  'git push --force-with-lease=origin/docs/codex-workflow origin docs/codex-workflow',
  'git push origin --force-with-lease',
  'git push origin HEAD --force-with-lease',
  'bash -lc "git push --force-with-lease origin docs/codex-workflow"',
]

const bannedForcePushes = [
  'git push --force',
  'git push --force origin main',
  'git push origin --force',
  'git push -f',
  'git push -f origin main',
  'git push +HEAD:main',
  'git push origin +HEAD:main',
]

describe('Claude settings deny list under Grok Bash matching', () => {
  it('does not include the prefix-unsafe exact --force deny', () => {
    expect(denyRules).not.toContain('Bash(git push --force)')
  })

  it('keeps a leading-glob deny for the no-arg force push', () => {
    expect(denyRules).toContain('Bash(*git push --force)')
  })

  it.each(sanctionedForceWithLease)('does not deny sanctioned rebase push: %s', command => {
    expect(grokBashDenied(denyRules, command)).toBe(false)
  })

  it.each(bannedForcePushes)('still denies banned force-push: %s', command => {
    expect(grokBashDenied(denyRules, command)).toBe(true)
  })

  it('treats Bash(git push --force) as a prefix of --force-with-lease', () => {
    expect(grokBashMatches('git push --force', 'git push --force-with-lease origin HEAD')).toBe(
      true,
    )
    expect(grokBashMatches('git push --force *', 'git push --force-with-lease origin HEAD')).toBe(
      false,
    )
    expect(grokBashMatches('*git push --force', 'git push --force')).toBe(true)
    expect(grokBashMatches('*git push --force', 'git push --force-with-lease origin HEAD')).toBe(
      false,
    )
  })
})
