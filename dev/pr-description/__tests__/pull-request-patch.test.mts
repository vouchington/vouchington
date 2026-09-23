import { describe, expect, it } from 'vitest'

import { readPullRequestPatch } from '../pull-request-patch.mts'

const TARGET = {
  mergeCommitOid: undefined,
  number: 386,
  owner: 'vouchington',
  repo: 'vouchington',
  state: 'OPEN',
}

function runGhAtFileLimit(changedFiles: number) {
  return async (args: string[]) => {
    if (args[0] === 'pr') throw new Error('HTTP 406: PullRequest.diff is too_large')
    if (args.includes('--jq')) return String(changedFiles)
    const page = Number(args.at(-1)?.slice('page='.length))
    return JSON.stringify(
      Array.from({ length: 20 }, (_, offset) => ({
        filename: `retired/file-${(page - 1) * 20 + offset}.ts`,
        status: 'removed',
      })),
    )
  }
}

describe('readPullRequestPatch', () => {
  it('uses the files API when GitHub refuses an oversized unified PR diff', async () => {
    const calls: string[][] = []
    const result = await readPullRequestPatch(
      async args => {
        calls.push(args)
        if (args[0] === 'pr') throw new Error('HTTP 406: PullRequest.diff is too_large')
        if (args.at(-1)?.endsWith('page=1')) {
          return JSON.stringify([
            { filename: 'web/app/retired/page.tsx', status: 'removed' },
            {
              filename: 'package.json',
              patch: '@@ -1 +1 @@\n-  "old": "script",',
              status: 'modified',
            },
          ])
        }
        throw new Error(`unexpected API request: ${args.join(' ')}`)
      },
      '386',
      TARGET,
    )

    expect(calls).toEqual([
      ['pr', 'diff', '386'],
      [
        'api',
        'repos/vouchington/vouchington/pulls/386/files',
        '-X',
        'GET',
        '-F',
        'per_page=20',
        '-F',
        'page=1',
      ],
    ])
    expect(result.source).toBe('files-api')
    expect(result.patch).toContain('deleted file mode 100644')
    expect(result.patch).toContain('+++ b/package.json')
    expect(result.patch).toContain('-  "old": "script",')
  })

  it('labels the normal unified diff source', async () => {
    await expect(
      readPullRequestPatch(async () => 'diff --git a/a b/a', '386', TARGET),
    ).resolves.toEqual({ patch: 'diff --git a/a b/a', source: 'unified-diff' })
  })

  it('accepts a complete 3000-file API response', async () => {
    const result = await readPullRequestPatch(runGhAtFileLimit(3000), '386', TARGET)
    expect(result.source).toBe('files-api')
    expect(result.patch).toContain('retired/file-2999.ts')
  })

  it('rejects a truncated 3000-file API response', async () => {
    await expect(readPullRequestPatch(runGhAtFileLimit(3001), '386', TARGET)).rejects.toThrow(
      'HTTP 406: PullRequest.diff is too_large',
    )
  })

  it('preserves the original diff failure when the files API cannot recover it', async () => {
    const diffError = new Error('HTTP 406: PullRequest.diff is too_large')
    await expect(
      readPullRequestPatch(async () => Promise.reject(diffError), '386', TARGET),
    ).rejects.toBe(diffError)
  })
})
