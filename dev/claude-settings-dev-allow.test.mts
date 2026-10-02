import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { PLAIN_FORCE_PUSH_REASON } from './codex-hooks/policy/blocked-command-patterns.mts'
import { plainForcePushReason } from './plain-force-push.mts'

// Claude Code matches a Bash rule against the whole command text, with `*` standing in for any
// text; a trailing ` *` that is the rule's only wildcard also matches the bare command. The
// blanket dev/ allow rules skip review for every checked-in dev/ entrypoint; each dev/ command
// that leaves the OS sandbox also keeps a narrow allow rule, because auto mode may drop the blanket
// ones and Claude Code documents that it keeps narrow rules. The `/../` deny rules refuse the plain
// spelling of a path that escapes dev/. `sandbox.excludedCommands` holds only this repository's
// dev/ scripts (host sandbox policy is machine-owned; see agent-sandbox-config.test.mts).
// Rationale: docs/development/agent-sandbox.md#claude-review-skip-for-dev-commands.

type ClaudeSettings = {
  permissions: { allow: string[]; deny: string[] }
  sandbox: { excludedCommands: string[] }
}

const claudeSettings = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../.claude/settings.json'), 'utf8'),
) as ClaudeSettings

const bashPatterns = (rules: string[]) =>
  rules.flatMap(rule => {
    const match = /^Bash\((.*)\)$/s.exec(rule)
    return match?.[1] === undefined ? [] : [match[1]]
  })

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function claudeBashMatches(rule: string, command: string): boolean {
  const pattern = rule.endsWith(':*') ? `${rule.slice(0, -2)} *` : rule
  const soleTrailingWildcard = pattern.endsWith(' *') && pattern.indexOf('*') === pattern.length - 1
  if (soleTrailingWildcard && command === pattern.slice(0, -2)) return true
  return new RegExp(`^${escapeRegex(pattern).replaceAll('\\*', '.*')}$`, 's').test(command)
}

const allowPatterns = bashPatterns(claudeSettings.permissions.allow)
const denyPatterns = bashPatterns(claudeSettings.permissions.deny)
const isAllowed = (command: string) => allowPatterns.some(p => claudeBashMatches(p, command))
const isDenied = (command: string) => denyPatterns.some(p => claudeBashMatches(p, command))
const isDevCommand = (command: string) =>
  command.startsWith('./dev') || command.startsWith('node dev')

describe('Claude review-skip for dev/ commands', () => {
  it('pre-approves dev/ commands through the blanket rules plus one narrow rule per unsandboxed command', () => {
    const unsandboxedDevCommands = claudeSettings.sandbox.excludedCommands.filter(isDevCommand)
    expect(allowPatterns.filter(isDevCommand).toSorted()).toEqual(
      ['./dev/*', 'node dev/*', ...unsandboxedDevCommands].toSorted(),
    )
  })

  it.each([
    './dev/tmux-name web',
    './dev/check-fresh-base',
    './dev/audit-rename web/lib/old.mts web/lib/new.mts',
    './dev/audit-rename ../old new',
    'node dev/pr-description.mts update 1',
    'node dev/sandbox-command-audit.mts --help',
  ])('allows %s without review', command => {
    expect(isAllowed(command)).toBe(true)
    expect(isDenied(command)).toBe(false)
  })

  it.each([
    './dev/../bin/sh',
    './dev/lib/../../bin/sh',
    'node dev/../escape.mjs',
    'node dev/lib/../../escape.mjs',
  ])('denies the dev/ path escape %s', command => {
    expect(isAllowed(command)).toBe(true)
    expect(isDenied(command)).toBe(true)
  })
})

// The documented rebase lifecycle (.agents/skills/agent-workflow/git-and-prs.md) skips review only
// as bare commands; starting a rebase stays on ./dev/rebase-onto-main. Raw force pushes are left
// to the PreToolUse hook and .husky/pre-push. Rationale:
// docs/development/agent-sandbox.md#claude-review-skip-for-the-rebase-lifecycle.
describe('Claude review-skip for the rebase lifecycle', () => {
  const sha = 'a'.repeat(40)

  it.each([
    'GIT_EDITOR=true git rebase --continue',
    'git rebase --skip',
    'git rebase --abort',
    `git push --force-with-lease=fix/example:${sha}`,
    `git push --force-with-lease=fix/example:${sha} origin fix/example`,
  ])('allows %s without review', command => {
    expect(isAllowed(command)).toBe(true)
    expect(isDenied(command)).toBe(false)
    expect(plainForcePushReason(command)).toBeNull()
  })

  it.each([
    'git rebase origin/main',
    'git rebase -i HEAD~3',
    'git rebase --onto origin/main HEAD~2',
    'GIT_EDITOR=vim git rebase --continue',
    'git push --force-with-lease',
    'git -C ../other rebase --skip',
    `git -C ../other push --force-with-lease=fix/example:${sha}`,
    'cd ../other && git rebase --skip',
  ])('keeps %s on review', command => {
    expect(isAllowed(command)).toBe(false)
  })

  it.each([
    `git push --force-with-lease=fix/example:${sha} --force origin fix/example`,
    `git push --force-with-lease=fix/example:${sha} -f origin fix/example`,
    `git push --force-with-lease=fix/example:${sha} origin +HEAD:main`,
  ])('leaves the raw force in %s to the push hooks', command => {
    expect(isAllowed(command)).toBe(true)
    expect(plainForcePushReason(command)).toBe(PLAIN_FORCE_PUSH_REASON)
  })
})
