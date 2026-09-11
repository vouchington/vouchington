import { describe, expect, it } from 'vitest'
import { executeBatch, parseBatchArgs, type BatchDeps } from '../batch-issues.mts'

const VALID_MANIFEST = JSON.stringify({
  targetRepo: 'jonathanong/filaments',
  entries: [
    {
      id: 'e1',
      title: 'Fix the thing',
      bodyFile: 'body-e1.md',
      paths: [],
      priority: 'priority: medium',
    },
  ],
})

function makeDeps(overrides: Partial<BatchDeps> = {}): BatchDeps {
  return {
    readManifest: async () => VALID_MANIFEST,
    readBody: async () => 'body',
    runGh: async (args: string[]) => {
      const endpoint =
        args.find(arg => arg.includes('/labels') || arg.includes('/milestones')) ?? ''
      if (args[0] === 'auth') return ''
      if (args[0] === 'api' && endpoint.includes('/labels'))
        return JSON.stringify([[{ name: 'priority: medium' }]])
      if (args[0] === 'api' && endpoint.includes('/milestones')) return JSON.stringify([[]])
      if (args[0] === 'issue' && args[1] === 'list') return JSON.stringify([])
      throw new Error(`unexpected gh invocation: ${args.join(' ')}`)
    },
    pathExists: async () => true,
    writeArtifact: async () => {},
    labelerPath: '/dev/null',
    ...overrides,
  }
}

describe('parseBatchArgs', () => {
  it('parses a valid preflight invocation', () => {
    expect(
      parseBatchArgs(['preflight', '--session-dir', '/tmp/x', '--repo', 'jonathanong/filaments']),
    ).toEqual({ subcommand: 'preflight', sessionDir: '/tmp/x', repo: 'jonathanong/filaments' })
  })

  it.each(['create', 'verify', 'run'])('rejects the removed %s mutation mode', subcommand => {
    expect(() =>
      parseBatchArgs([subcommand, '--session-dir', '/tmp/x', '--repo', 'jonathanong/filaments']),
    ).toThrow(/Usage:.*preflight/)
  })

  it.each([
    ['no arguments', [], /Usage:/],
    ['an unknown subcommand', ['bogus', '--session-dir', '/tmp', '--repo', 'r'], /Usage:/],
    ['a missing --session-dir', ['preflight', '--repo', 'r'], /--session-dir is required/],
    ['a missing --repo', ['preflight', '--session-dir', '/tmp'], /--repo is required/],
    [
      'a --session-dir with no value',
      ['preflight', '--session-dir'],
      /--session-dir requires a path/,
    ],
    [
      'a --repo with no value',
      ['preflight', '--session-dir', '/tmp', '--repo'],
      /--repo requires an owner\/repo value/,
    ],
    [
      'a duplicate --session-dir',
      ['preflight', '--session-dir', '/tmp/a', '--session-dir', '/tmp/b', '--repo', 'r'],
      /--session-dir may be provided only once/,
    ],
    [
      'a duplicate --repo',
      ['preflight', '--session-dir', '/tmp', '--repo', 'r1', '--repo', 'r2'],
      /--repo may be provided only once/,
    ],
    [
      'an unknown option',
      ['preflight', '--session-dir', '/tmp', '--repo', 'r', '--bogus'],
      /Unknown or incomplete option/,
    ],
  ])('rejects %s', (_name, argv, expectedMessage) => {
    expect(() => parseBatchArgs(argv)).toThrow(expectedMessage)
  })
})

describe('executeBatch', () => {
  it('writes a report without invoking an issue mutation', async () => {
    const calls: string[][] = []
    const artifacts: Array<{ data: unknown; path: string }> = []
    const defaultRunGh = makeDeps().runGh
    const result = await executeBatch(
      ['preflight', '--session-dir', '/tmp/session', '--repo', 'jonathanong/filaments'],
      makeDeps({
        runGh: async args => {
          calls.push(args)
          return defaultRunGh(args)
        },
        writeArtifact: async (path, data) => {
          artifacts.push({ data, path })
        },
      }),
    )
    expect(result.exitCode).toBe(0)
    expect(result.summary).toContain('Preflight pass')
    expect(calls).toHaveLength(4)
    expect(calls).not.toContainEqual(expect.arrayContaining(['issue', 'create']))
    expect(calls).not.toContainEqual(expect.arrayContaining(['graphql']))
    expect(artifacts).toEqual([
      {
        path: '/tmp/session/preflight-report.json',
        data: expect.objectContaining({ status: 'pass' }),
      },
    ])
  })

  it('writes a blocked report and exits nonzero', async () => {
    const artifacts: Array<{ data: unknown; path: string }> = []
    const result = await executeBatch(
      ['preflight', '--session-dir', '/tmp/session', '--repo', 'jonathanong/filaments'],
      makeDeps({
        readManifest: async () =>
          JSON.stringify({
            targetRepo: 'jonathanong/filaments',
            entries: [
              {
                id: 'e1',
                title: 'Fix the thing',
                bodyFile: 'body-e1.md',
                paths: [],
                priority: 'priority: medium',
                extraLabels: ['missing-label'],
              },
            ],
          }),
        writeArtifact: async (path, data) => {
          artifacts.push({ data, path })
        },
      }),
    )

    expect(result.exitCode).toBe(1)
    expect(result.summary).toContain('Preflight blocked')
    expect(artifacts).toEqual([
      {
        path: '/tmp/session/preflight-report.json',
        data: expect.objectContaining({ status: 'blocked' }),
      },
    ])
  })
})
