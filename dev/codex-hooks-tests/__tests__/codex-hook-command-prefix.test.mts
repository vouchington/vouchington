import { describe, expect, it } from 'vitest'

import { findPreToolUseBlock } from '../../codex-hooks/policy.mts'
import { findGitHubWorkflowBlock } from '../../codex-hooks/policy-helpers.mts'
import { parseCommandPrefix } from '../../codex-hooks/policy/shell-command-wrappers.mts'
import type { ReferencedIssue } from '../../pr-description/closing-refs.mts'

const OPEN_ISSUE: ReferencedIssue = {
  body: '',
  isPullRequest: false,
  number: 1,
  state: 'open',
  title: 'Open issue',
  url: 'https://github.com/owner/repo/issues/1',
}

describe('parseCommandPrefix', () => {
  it('collects env assignments, unsets, and each env -C across a wrapper chain', () => {
    expect(
      parseCommandPrefix([
        'FOO=1',
        'env',
        '-C',
        '/a',
        '-u',
        'FOO',
        '-C',
        '/b',
        'BAR=2',
        'nohup',
        'env',
        '-Cc',
      ]),
    ).toEqual({
      chdir: ['/b', 'c'],
      env: { BAR: '2', FOO: undefined },
      wrappers: ['env', 'nohup', 'env'],
    })
  })

  it('reads env long options, a lone -, and -- as their short forms', () => {
    expect(
      parseCommandPrefix([
        'env',
        '--chdir=/a',
        '--unset',
        'FOO',
        '-',
        '--ignore-environment',
        '--',
      ]),
    ).toEqual({ chdir: ['/a'], env: { FOO: undefined }, wrappers: ['env'] })
  })

  it('reads an attached option argument', () => {
    expect(parseCommandPrefix(['env', '-uFOO', '-C/tmp'])).toEqual({
      chdir: ['/tmp'],
      env: { FOO: undefined },
      wrappers: ['env'],
    })
  })

  it('reads every modeled wrapper and matches it by basename', () => {
    expect(
      parseCommandPrefix(['builtin', 'command', '-p', 'exec', '-c', '-l', '-a', 'x', 'time', '-p'])
        ?.wrappers,
    ).toEqual(['builtin', 'command', 'exec', 'time'])
    expect(parseCommandPrefix(['/usr/bin/env', '-C', '/tmp'])?.chdir).toEqual(['/tmp'])
  })

  it('drops redirections from the argv the wrappers see', () => {
    expect(parseCommandPrefix(['2>', '/dev/null', 'env', '-C', '<', 'in', '/tmp'])).toEqual(
      expect.objectContaining({ chdir: ['/tmp'], wrappers: ['env'] }),
    )
  })

  it('skips reserved words and function headers that open a command', () => {
    expect(parseCommandPrefix(['function', 'f', '{'])?.wrappers).toEqual([])
    expect(parseCommandPrefix(['if', '!'])?.wrappers).toEqual([])
    expect(parseCommandPrefix(['time', '!'])?.wrappers).toEqual(['time'])
  })

  it.each([
    [['echo']],
    [['function']],
    [['command', '-v']],
    [['command', '-pV']],
    [['env', '-C']],
    [['env', '-S', 'bash']],
    [['env', '--split-string=bash']],
    [['env', '--chdirx=/a']],
    [['env', '--unsetFOO']],
    [['env', '-v']],
    [['env', '-iC/tmp']],
    [['exec', '-a']],
    [['nohup', '!']],
    [['env', '>']],
    // Wrappers outside the modeled set leave the command word unread.
    [['timeout', '5']],
    [['nice', '-n', '5']],
    [['sudo']],
    [['noglob']],
    [['xargs']],
  ])('returns null when the next word is not the command the shell runs: %j', words => {
    expect(parseCommandPrefix(words)).toBeNull()
  })
})

describe('Codex hook gh policies behind a modeled wrapper chain', () => {
  it.each([
    'env -C /tmp gh pr create --title t --body "Closes #1"',
    'nohup env -u GH_TOKEN gh pr create --title t --body "Closes #1"',
  ])('requires draft PRs behind a wrapper: %s', command => {
    expect(findPreToolUseBlock({ tool_input: { command } })?.reason).toContain(
      'New PRs must be opened as draft first',
    )
  })

  it('resolves closing refs from the env -C directory', () => {
    let resolverCwd: string | undefined
    const block = findGitHubWorkflowBlock(
      'env -C /other gh pr create --draft --title t --body "Closes #1"',
      '/session',
      {
        resolveClosingIssueReference: (_ref, cwd) => {
          resolverCwd = cwd
          return { issue: OPEN_ISSUE, ok: true }
        },
        validateClosingIssueReferences: true,
      },
    )
    expect(block).toBeNull()
    expect(resolverCwd).toBe('/other')
  })
})
