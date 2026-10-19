import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { commandCwd } from '../../codex-hooks/policy/github-command-cwd.mts'
import { commandPrefixAt } from '../../codex-hooks/policy/github-command-position.mts'
import { tokenizeShellWords } from '../../codex-hooks/policy-helpers.mts'

const BASE_CWD = '/filaments-session'

function tokensOf(command: string): string[] {
  return tokenizeShellWords(command, { splitRedirections: true })
}

function ghIndex(tokens: string[]): number {
  return tokens.findIndex(
    (token, index) => token === 'gh' && commandPrefixAt(tokens, index) !== null,
  )
}

function cwdFor(command: string, baseCwd = BASE_CWD): string | undefined {
  const tokens = tokensOf(command)
  return commandCwd(tokens, ghIndex(tokens), baseCwd)
}

describe('commandCwd sequential cd tracking', () => {
  it.each([
    ['cd /other && gh pr create --draft --fill', '/other'],
    ['cd /a && cd /b && gh pr create --draft --fill', '/b'],
    ['cd /a; gh pr create --draft --fill', '/a'],
    ['cd /a\ngh pr create --draft --fill', '/a'],
    ['cd -- /other && gh pr create --draft --fill', '/other'],
    ['cd -L /other && gh pr create --draft --fill', '/other'],
    ['command cd /other && gh pr create --draft --fill', '/other'],
    ['cd "$WORKTREE" && cd /abs && gh pr create --draft --fill', '/abs'],
    ['{ cd /other; }; gh pr create --draft --fill', '/other'],
    ['env -C /other gh pr create --draft --fill', '/other'],
    ['env --chdir=/other gh pr create --draft --fill', '/other'],
    ['env -C /a -C /b gh pr create --draft --fill', '/b'],
    ['cd /a && env -C b gh pr create --draft --fill', resolve('/a', 'b')],
    ['env -C /a nohup env -C b gh pr create --draft --fill', resolve('/a', 'b')],
  ])('applies sequential cd for %s', (command, expected) => {
    expect(cwdFor(command)).toBe(expected)
  })

  it('resolves relative cd against the session cwd', () => {
    expect(cwdFor('cd sub && gh pr create --draft --fill', '/base')).toBe(resolve('/base', 'sub'))
  })

  it.each([
    'cd /other | gh pr create --draft --fill',
    'cd /other & gh pr create --draft --fill',
    'echo cd /other && gh pr create --draft --fill',
    '(cd /wrong; true); gh pr create --draft --fill',
    'printf x | cd /other; gh pr create --draft --fill',
    'f() { cd /other; }; gh pr create --draft --fill',
    'function f { cd /other; }; gh pr create --draft --fill',
    'env cd /other && gh pr create --draft --fill',
  ])('keeps session cwd for %s', command => {
    expect(cwdFor(command)).toBe(BASE_CWD)
  })

  it.each([
    'cd /other || gh pr create --draft --fill',
    'cd $OTHER && gh pr create --draft --fill',
    'cd ~/repo && gh pr create --draft --fill',
    'cd /repo-* && gh pr create --draft --fill',
    'cd -P /other && gh pr create --draft --fill',
    'cd - && gh pr create --draft --fill',
    'cd && gh pr create --draft --fill',
    'if false; then cd /other; fi; gh pr create --draft --fill',
    'cd /primary || cd /fallback; gh pr create --draft --fill',
    'cd "$WORKTREE" && cd packages/api && gh pr create --draft --fill',
    'cd /other extra; gh pr create --draft --fill',
    'env -C "$OTHER" gh pr create --draft --fill',
    'cd $OTHER && env -C b gh pr create --draft --fill',
  ])('leaves cwd unknown for %s', command => {
    expect(cwdFor(command)).toBeUndefined()
  })

  it('lexically normalizes absolute cd paths', () => {
    expect(cwdFor('cd /work/link/.. && gh pr create --draft --fill')).toBe('/work')
  })

  it('inherits cwd into a following subshell', () => {
    expect(cwdFor('cd /right && (gh pr create --draft --fill)')).toBe('/right')
  })

  it('returns the shell cwd for a word that is an argument, not a command', () => {
    expect(commandCwd(tokensOf('cd /right && echo gh'), 4, BASE_CWD)).toBe('/right')
  })
})
