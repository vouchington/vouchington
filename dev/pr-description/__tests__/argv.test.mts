import { describe, expect, it } from 'vitest'

import { parseBodyFileArg, parseCreateArgs } from '../argv.mts'

describe('parseBodyFileArg', () => {
  it('extracts --body-file and its value, leaving the rest untouched', () => {
    expect(parseBodyFileArg(['validate', '--body-file', 'body.md', '123'])).toEqual({
      bodyFile: 'body.md',
      remaining: ['validate', '123'],
    })
  })

  it('accepts the -F short form', () => {
    expect(parseBodyFileArg(['-F', 'body.md'])).toEqual({ bodyFile: 'body.md', remaining: [] })
  })

  it('accepts a bare "-" as the value (stdin)', () => {
    expect(parseBodyFileArg(['--body-file', '-'])).toEqual({ bodyFile: '-', remaining: [] })
  })

  it('returns an undefined bodyFile and the untouched argv when absent', () => {
    expect(parseBodyFileArg(['123'])).toEqual({ bodyFile: undefined, remaining: ['123'] })
  })

  it('throws when --body-file is specified twice', () => {
    expect(() => parseBodyFileArg(['--body-file', 'a.md', '--body-file', 'b.md'])).toThrow(
      'body file may only be specified once',
    )
  })

  it('throws when --body-file has no value', () => {
    expect(() => parseBodyFileArg(['--body-file'])).toThrow('--body-file requires a value')
  })

  it('throws when --body-file is immediately followed by another flag', () => {
    expect(() => parseBodyFileArg(['--body-file', '--title'])).toThrow(
      '--body-file requires a value',
    )
  })
})

describe('parseCreateArgs', () => {
  it('extracts --title and its value, leaving positionals separate', () => {
    expect(parseCreateArgs(['--title', 'Add feature'])).toEqual({
      acknowledgeLargeDiff: false,
      positionals: [],
      title: 'Add feature',
    })
  })

  it('accepts the -t short form', () => {
    expect(parseCreateArgs(['-t', 'Add feature'])).toEqual({
      acknowledgeLargeDiff: false,
      positionals: [],
      title: 'Add feature',
    })
  })

  it('collects positionals alongside a title', () => {
    expect(parseCreateArgs(['extra', '--title', 'Add feature'])).toEqual({
      acknowledgeLargeDiff: false,
      positionals: ['extra'],
      title: 'Add feature',
    })
  })

  it('throws when --title is specified twice', () => {
    expect(() => parseCreateArgs(['--title', 'a', '--title', 'b'])).toThrow(
      'title may only be specified once',
    )
  })

  it('throws when --title has no value', () => {
    expect(() => parseCreateArgs(['--title'])).toThrow('--title requires a value')
  })

  it('throws on an unrecognized flag', () => {
    expect(() => parseCreateArgs(['--bogus'])).toThrow('unknown option: --bogus')
  })

  it('parses --acknowledge-large-diff as a boolean flag', () => {
    expect(parseCreateArgs(['--title', 'Add feature', '--acknowledge-large-diff'])).toEqual({
      acknowledgeLargeDiff: true,
      positionals: [],
      title: 'Add feature',
    })
  })

  it('defaults acknowledgeLargeDiff to false when omitted', () => {
    expect(parseCreateArgs(['--title', 'Add feature']).acknowledgeLargeDiff).toBe(false)
  })

  it('throws when --acknowledge-large-diff is specified twice', () => {
    expect(() => parseCreateArgs(['--acknowledge-large-diff', '--acknowledge-large-diff'])).toThrow(
      '--acknowledge-large-diff may only be specified once',
    )
  })

  it('accepts --acknowledge-large-diff alongside positionals and --title in any order', () => {
    expect(
      parseCreateArgs(['extra', '--acknowledge-large-diff', '--title', 'Add feature']),
    ).toEqual({
      acknowledgeLargeDiff: true,
      positionals: ['extra'],
      title: 'Add feature',
    })
  })
})
