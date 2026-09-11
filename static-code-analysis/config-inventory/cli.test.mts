import { describe, expect, it } from 'vitest'

import { getConfigInventoryUsage, parseConfigInventoryArgs } from './cli.mts'

describe('config inventory CLI', () => {
  it('parses supported options', () => {
    expect(parseConfigInventoryArgs(['--format', 'json', '--repo-root', '/repo'])).toEqual({
      format: 'json',
      repoRoot: '/repo',
    })
  })

  it('defaults to Markdown in the current working directory', () => {
    expect(parseConfigInventoryArgs([])).toEqual({
      format: 'markdown',
      repoRoot: process.cwd(),
    })
  })

  it('returns usage options for help flags', () => {
    expect(parseConfigInventoryArgs(['--help'])).toEqual({
      format: 'markdown',
      help: true,
      repoRoot: process.cwd(),
    })
    expect(parseConfigInventoryArgs(['-h', '--format', 'json'])).toEqual({
      format: 'markdown',
      help: true,
      repoRoot: process.cwd(),
    })
    expect(getConfigInventoryUsage()).toContain('Usage: ./dev/config-inventory')
  })

  it('rejects unsupported formats and arguments', () => {
    expect(() => parseConfigInventoryArgs(['--format', 'xml'])).toThrow(
      '--format must be json or markdown',
    )
    expect(() => parseConfigInventoryArgs(['--wat'])).toThrow('Unknown argument: --wat')
  })
})
