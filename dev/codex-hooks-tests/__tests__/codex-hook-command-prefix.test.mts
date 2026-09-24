import { describe, expect, it } from 'vitest'

import { parseCommandPrefix } from '../../codex-hooks/policy/shell-command-wrappers.mts'
import { parseOptions } from '../../codex-hooks/policy/shell-option-grammar.mts'
import { ENV_GRAMMAR } from '../../codex-hooks/policy/shell-wrapper-grammars.mts'

function flag(name: string): { name: string; value: undefined } {
  return { name, value: undefined }
}

describe('parseOptions', () => {
  it('resolves an unambiguous long-option prefix to the full option', () => {
    expect(parseOptions(['--ch', '/tmp', 'gh'], 0, ENV_GRAMMAR)).toEqual({
      next: 2,
      options: [{ name: 'chdir', value: '/tmp' }],
    })
  })

  it('parses ambiguous and unknown long options as flags, since env exits on them', () => {
    expect(parseOptions(['--i', '--bogus=1', 'gh'], 0, ENV_GRAMMAR)).toEqual({
      next: 2,
      options: [flag('i'), { name: 'bogus', value: '1' }],
    })
  })

  it('takes an optional long argument only when attached', () => {
    expect(
      parseOptions(['--block-signal', '--default-signal=INT', 'gh'], 0, ENV_GRAMMAR)?.options,
    ).toEqual([flag('block-signal'), { name: 'default-signal', value: 'INT' }])
  })

  it('reads a short cluster up to its first argument-taking letter', () => {
    expect(parseOptions(['-ivC/tmp', 'gh'], 0, ENV_GRAMMAR)).toEqual({
      next: 1,
      options: [flag('ignore-environment'), flag('v'), { name: 'chdir', value: '/tmp' }],
    })
  })

  it.each([[['--chdir']], [['-C']], [['-iu']], [['--split-string']]])(
    'returns null when an option is missing its argument: %j',
    words => {
      expect(parseOptions(words, 0, ENV_GRAMMAR)).toBeNull()
    },
  )

  it('stops right after -- and at the first operand', () => {
    expect(parseOptions(['-i', '--', '-C', 'gh'], 0, ENV_GRAMMAR)?.next).toBe(2)
    expect(parseOptions(['FOO=1', '-C', '/tmp'], 0, ENV_GRAMMAR)).toEqual({ next: 0, options: [] })
  })

  it('treats a lone - as the grammar option it abbreviates, or else as an operand', () => {
    expect(parseOptions(['-', 'gh'], 0, ENV_GRAMMAR)?.options).toEqual([flag('ignore-environment')])
    expect(parseOptions(['-', 'gh'], 0, {})).toEqual({ next: 0, options: [] })
  })

  it.each(['-5', '--5', '-+5'])('parses the legacy numeric adjustment %s', word => {
    expect(parseOptions([word, 'gh'], 0, { numeric: 'adjustment' })).toEqual({
      next: 1,
      options: [{ name: 'adjustment', value: word.slice(1) }],
    })
  })

  it('fills an optional short argument only when attached', () => {
    expect(parseOptions(['-i{}', '-i', 'gh'], 0, { shortOptionalArgument: 'i' })?.options).toEqual([
      { name: 'i', value: '{}' },
      flag('i'),
    ])
  })
})

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
      splitString: false,
      wrappers: ['env', 'nohup', 'env'],
      xargsReplacements: [],
    })
  })

  it('drops redirections from the argv the wrappers see', () => {
    expect(parseCommandPrefix(['2>', '/dev/null', 'env', '-C', '<', 'in', '/tmp'])).toEqual(
      expect.objectContaining({ chdir: ['/tmp'], wrappers: ['env'] }),
    )
  })

  it('marks an env -S split string, which can carry its own -C', () => {
    expect(parseCommandPrefix(['env', '-S', '-C /x'])?.splitString).toBe(true)
  })

  it('records xargs replacement strings, defaulting to {}', () => {
    expect(
      parseCommandPrefix(['xargs', '-I', '%', '-i', '--replace=@', '--replace'])?.xargsReplacements,
    ).toEqual(['%', '{}', '@', '{}'])
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
    [['timeout']],
    [['timeout', '-s', 'KILL']],
    [['env', '-C']],
    [['nice', '-n']],
    [['nohup', '!']],
    [['env', '>']],
  ])('returns null when the next word is not the command the shell runs: %j', words => {
    expect(parseCommandPrefix(words)).toBeNull()
  })
})
