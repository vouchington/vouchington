import { describe, expect, it } from 'vitest'

import { parseFlagArgs } from '../parse-flag-args.mts'

type ParsedArgs = { file?: string; sessionIdArg?: string }
const FLAG_KEYS: Record<string, keyof ParsedArgs> = {
  '--file': 'file',
  '--session-id': 'sessionIdArg',
}

describe('parseFlagArgs', () => {
  it('parses recognized flags into the target shape', () => {
    const { parsed, positional } = parseFlagArgs<ParsedArgs>(
      ['--file', 'note.md', '--session-id', 'sess-1'],
      FLAG_KEYS,
    )
    expect(parsed).toEqual({ file: 'note.md', sessionIdArg: 'sess-1' })
    expect(positional).toEqual([])
  })

  it('accepts a legitimate value that starts with a dash', () => {
    const { parsed } = parseFlagArgs<ParsedArgs>(['--file', '-weird-name.md'], FLAG_KEYS)
    expect(parsed.file).toBe('-weird-name.md')
  })

  it('treats a following recognized flag as a missing value', () => {
    expect(() =>
      parseFlagArgs<ParsedArgs>(['--file', '--session-id', 'sess-1'], FLAG_KEYS),
    ).toThrow('--file requires a value')
  })

  it('treats a trailing flag with no value as missing', () => {
    expect(() => parseFlagArgs<ParsedArgs>(['--file'], FLAG_KEYS)).toThrow(
      '--file requires a value',
    )
  })

  it('treats the end-of-options marker as a missing value', () => {
    expect(() => parseFlagArgs<ParsedArgs>(['--file', '--'], FLAG_KEYS)).toThrow(
      '--file requires a value',
    )
  })

  it('rejects a flag specified twice', () => {
    expect(() =>
      parseFlagArgs<ParsedArgs>(['--file', 'a.md', '--file', 'b.md'], FLAG_KEYS),
    ).toThrow('--file may only be specified once')
  })

  it('collects every value of a repeatable flag in order', () => {
    type RepeatableArgs = { repositories?: string[] }
    const { parsed } = parseFlagArgs<RepeatableArgs>(
      ['--repository', 'owner/one', '--repository', 'owner/two'],
      { '--repository': { key: 'repositories', type: 'repeatable' } },
    )
    expect(parsed.repositories).toEqual(['owner/one', 'owner/two'])
  })

  it('treats a repeatable flag with no value as missing', () => {
    expect(() =>
      parseFlagArgs<{ repositories?: string[] }>(['--repository'], {
        '--repository': { key: 'repositories', type: 'repeatable' },
      }),
    ).toThrow('--repository requires a value')
  })

  it('rejects an unrecognized flag', () => {
    expect(() => parseFlagArgs<ParsedArgs>(['--wat'], FLAG_KEYS)).toThrow('unknown option: --wat')
  })

  it('collects positional arguments and leaves flag parsing after -- untouched', () => {
    const { parsed, positional } = parseFlagArgs<ParsedArgs>(
      ['positional-one', '--', '--file', 'literal-dash-file'],
      FLAG_KEYS,
    )
    expect(positional).toEqual(['positional-one', '--file', 'literal-dash-file'])
    expect(parsed).toEqual({})
  })
})
