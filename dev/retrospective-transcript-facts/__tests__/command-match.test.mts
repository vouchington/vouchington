import { describe, expect, it } from 'vitest'

import {
  isGitPushInvocation,
  isNoMistakesInvocation,
  splitCommandSegments,
} from '../command-match.mts'

describe('splitCommandSegments', () => {
  it('splits unquoted compound-command operators into separate segments', () => {
    expect(splitCommandSegments('git status && git push')).toEqual([
      ['git', 'status'],
      ['git', 'push'],
    ])
  })

  it('groups a quoted span, including internal whitespace, into a single word', () => {
    expect(splitCommandSegments('git commit -m "fix: git push behavior"')).toEqual([
      ['git', 'commit', '-m', 'fix: git push behavior'],
    ])
  })

  it('returns a single empty-array-free segment for a plain command with no operators', () => {
    expect(splitCommandSegments('cat foo.txt')).toEqual([['cat', 'foo.txt']])
  })
})

describe('isNoMistakesInvocation', () => {
  it('treats LF and CRLF as unquoted boundaries but preserves quoted newlines', () => {
    expect(isNoMistakesInvocation('echo done\npnpm run no-mistakes')).toBe(true)
    expect(isNoMistakesInvocation('echo done\r\npnpm run no-mistakes')).toBe(true)
    expect(isNoMistakesInvocation('echo "first\nno-mistakes"')).toBe(false)
  })

  it('matches a plain no-mistakes invocation, e.g. via a pnpm/npx script', () => {
    expect(isNoMistakesInvocation('pnpm run no-mistakes')).toBe(true)
    expect(isNoMistakesInvocation('npx no-mistakes check')).toBe(true)
  })

  it('matches no-mistakes after leading environment assignments', () => {
    expect(isNoMistakesInvocation('NO_MISTAKES_DEBUG=1 pnpm exec no-mistakes check')).toBe(true)
    expect(isNoMistakesInvocation('NODE_OPTIONS=--trace-warnings no-mistakes check')).toBe(true)
  })

  it('matches a path-qualified binary by basename', () => {
    expect(isNoMistakesInvocation('./node_modules/.bin/no-mistakes check')).toBe(true)
  })

  it('does not match no-mistakes mentioned inside a search pattern or quoted string', () => {
    expect(isNoMistakesInvocation('rg "no-mistakes|git push" .agents')).toBe(false)
    expect(isNoMistakesInvocation('echo "run no-mistakes later"')).toBe(false)
  })

  it('does not match an unrelated command', () => {
    expect(isNoMistakesInvocation('gh pr create')).toBe(false)
  })

  it('matches through an unquoted compound-command operator with no surrounding whitespace', () => {
    expect(isNoMistakesInvocation('pnpm run no-mistakes&& git status')).toBe(true)
  })

  it('does not match no-mistakes passed as a plain unquoted argument to an unrelated command', () => {
    expect(isNoMistakesInvocation('echo no-mistakes')).toBe(false)
  })
})

describe('isGitPushInvocation', () => {
  it('treats LF and CRLF as unquoted boundaries but preserves quoted newlines', () => {
    expect(isGitPushInvocation('git status\ngit push')).toBe(true)
    expect(isGitPushInvocation('git status\r\ngit push')).toBe(true)
    expect(isGitPushInvocation('echo "first\ngit push"')).toBe(false)
  })

  it('matches a plain git push, tolerating extra whitespace', () => {
    expect(isGitPushInvocation('git  push -u origin foo')).toBe(true)
  })

  it('matches git push after leading environment assignments', () => {
    expect(isGitPushInvocation('GIT_EDITOR=true git push origin HEAD')).toBe(true)
    expect(isGitPushInvocation('LC_ALL=C GIT_TRACE=1 /usr/bin/git push origin HEAD')).toBe(true)
  })

  it('matches git push through a path-qualified git binary and inside a compound command', () => {
    expect(isGitPushInvocation('cd web && /usr/bin/git push origin foo')).toBe(true)
  })

  it('does not match git push mentioned inside a quoted string, e.g. a commit message', () => {
    expect(isGitPushInvocation('echo "git push"')).toBe(false)
    expect(isGitPushInvocation('rg "no-mistakes|git push" .agents')).toBe(false)
    expect(isGitPushInvocation('git commit -m "fix: git push behavior"')).toBe(false)
  })

  it('does not match an unrelated command', () => {
    expect(isGitPushInvocation('gh pr create')).toBe(false)
  })

  it('matches through an unquoted compound-command operator with no surrounding whitespace', () => {
    expect(isGitPushInvocation('git push;gh pr view')).toBe(true)
  })

  it('does not match "git push" passed as plain unquoted arguments to an unrelated command', () => {
    expect(isGitPushInvocation('rg git push .agents')).toBe(false)
    expect(isGitPushInvocation('echo git push')).toBe(false)
  })

  it('matches push through git global options that precede the subcommand', () => {
    expect(isGitPushInvocation('git -C "$REPO_ROOT" push origin HEAD')).toBe(true)
    expect(isGitPushInvocation('git --no-pager push origin HEAD')).toBe(true)
  })

  it('does not match a different git subcommand reached by skipping global options', () => {
    expect(isGitPushInvocation('git -C "$REPO_ROOT" status')).toBe(false)
  })
})
