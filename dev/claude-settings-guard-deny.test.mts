import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

// Harness guards that replace prose rules: no main-database reset override, no Next.js dev
// server, and no worktree-deleting teardown. Claude Code matches a Bash rule against the whole
// command with `*` as any text. Grok's Claude-compat matcher also treats a rule without `*` as a
// character prefix, so `pnpm dev` and `pnpm run dev` would refuse `pnpm dev:storybook`; those two
// forms are left out and only `next dev` spellings are denied.

type ClaudeSettings = { permissions: { deny: string[] } }

const repoFile = (path: string) => readFileSync(resolve(import.meta.dirname, '..', path), 'utf8')
const claudeSettings = JSON.parse(repoFile('.claude/settings.json')) as ClaudeSettings
const denyPatterns = claudeSettings.permissions.deny.flatMap(rule => {
  const match = /^Bash\((.*)\)$/s.exec(rule)
  return match?.[1] === undefined ? [] : [match[1]]
})

const globMatches = (pattern: string, command: string) =>
  new RegExp(`^${RegExp.escape(pattern).replaceAll('\\*', '.*')}$`, 's').test(command)
const claudeDenied = (command: string) => denyPatterns.some(p => globMatches(p, command))
const grokDenied = (command: string) =>
  denyPatterns.some(p =>
    p.includes('*') ? command.startsWith(p) || globMatches(p, command) : command.startsWith(p),
  )

const guarded = [
  'FORCE_MAIN_RESET=1 ./dev/reset',
  'export FORCE_MAIN_RESET=1',
  'next dev',
  'next dev --port 3001',
  'npx next dev',
  'pnpm exec next dev --turbo',
  './dev/teardown --remove',
  './dev/teardown --yes --remove',
]

const allowed = [
  'pnpm dev --help',
  'pnpm dev:storybook',
  'pnpm run dev:cloudflare-worker',
  'next build',
  './dev/teardown',
  './dev/teardown --yes',
  './dev/reset',
]

describe('harness guard deny rules', () => {
  it.each(guarded)('denies %s under Claude and Grok matching', command => {
    expect(claudeDenied(command)).toBe(true)
    expect(grokDenied(command)).toBe(true)
  })

  it.each(allowed)('does not deny %s under Claude or Grok matching', command => {
    expect(claudeDenied(command)).toBe(false)
    expect(grokDenied(command)).toBe(false)
  })

  it('forbids the same commands in the Codex rules', () => {
    const rules = repoFile('.codex/rules/default.rules')
    for (const pattern of [
      '["FORCE_MAIN_RESET=1"]',
      '["export", "FORCE_MAIN_RESET=1"]',
      '["next", "dev"]',
      '["npx", "next", "dev"]',
      '["pnpm", "exec", "next", "dev"]',
      '["./dev/teardown", "--remove"]',
    ]) {
      expect(rules).toContain(`prefix_rule(pattern=${pattern}, decision="forbidden")`)
    }
  })
})
