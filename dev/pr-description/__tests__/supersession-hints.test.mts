import { describe, expect, it } from 'vitest'

import {
  parsePullRequestRefOids,
  resolveGhPackageJsonReader,
  writeSupersessionHints,
} from '../supersession-hints.mts'

describe('parsePullRequestRefOids', () => {
  it('parses baseRefOid/headRefOid from a gh pr view response', () => {
    expect(
      parsePullRequestRefOids(JSON.stringify({ baseRefOid: 'aaa', headRefOid: 'bbb' })),
    ).toEqual({ baseRefOid: 'aaa', headRefOid: 'bbb' })
  })

  it('throws when baseRefOid is missing', () => {
    expect(() => parsePullRequestRefOids(JSON.stringify({ headRefOid: 'bbb' }))).toThrow(
      'gh pr view response missing baseRefOid/headRefOid',
    )
  })

  it('throws when headRefOid is missing', () => {
    expect(() => parsePullRequestRefOids(JSON.stringify({ baseRefOid: 'aaa' }))).toThrow(
      'gh pr view response missing baseRefOid/headRefOid',
    )
  })
})

describe('resolveGhPackageJsonReader', () => {
  it('fetches baseRefOid/headRefOid for the given PR and builds a gh-backed reader', async () => {
    const calls: string[][] = []
    const runGh = (args: string[]) => {
      calls.push(args)
      if (args[0] === 'repo') return Promise.resolve(JSON.stringify({ nameWithOwner: 'a/b' }))
      if (args[0] === 'pr')
        return Promise.resolve(JSON.stringify({ baseRefOid: 'a', headRefOid: 'b' }))
      if (args[1]?.includes('/compare/'))
        return Promise.resolve(JSON.stringify({ merge_base_commit: { sha: 'm' } }))
      return Promise.resolve('{"name":"base"}')
    }
    const reader = await resolveGhPackageJsonReader(runGh, '42')
    await expect(reader('package.json', 'base')).resolves.toBe('{"name":"base"}')
    expect(calls).toEqual([
      ['repo', 'view', '--json', 'nameWithOwner'],
      ['pr', 'view', '42', '--json', 'baseRefOid,headRefOid'],
      ['api', 'repos/a/b/compare/a...b'],
      [
        'api',
        '-X',
        'GET',
        'repos/a/b/contents/package.json',
        '-f',
        'ref=m',
        '-H',
        'Accept: application/vnd.github.raw',
      ],
    ])
  })
})

describe('writeSupersessionHints', () => {
  it('writes hints to stderr when the search finds a superseded issue', async () => {
    const runGh = (args: string[]) =>
      Promise.resolve(
        args[0] === 'issue' ? JSON.stringify([{ number: 1, title: 'x', url: 'https://x' }]) : '[]',
      )
    const written: string[] = []
    const stderrSpy = (chunk: string): boolean => {
      written.push(chunk)
      return true
    }
    const original = process.stderr.write
    process.stderr.write = stderrSpy as typeof process.stderr.write
    try {
      await writeSupersessionHints(
        runGh,
        Promise.resolve('vouchington/vouchington'),
        Promise.resolve('diff --git a/backend/x.mts b/backend/x.mts\ndeleted file mode 100644\n'),
        Promise.resolve(async () => undefined),
      )
    } finally {
      process.stderr.write = original
    }
    expect(written.join('')).toContain('#1')
  })

  it('never throws when repo/diff/reader resolution rejects', async () => {
    await expect(
      writeSupersessionHints(
        () => Promise.reject(new Error('gh unavailable')),
        Promise.reject(new Error('no repo')),
        Promise.resolve(''),
        Promise.resolve(async () => undefined),
      ),
    ).resolves.toBeUndefined()
  })
})
