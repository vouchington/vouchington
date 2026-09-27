import { describe, expect, it } from 'vitest'
import { DiffCommandError } from 'vouchington-tooling/gh-cli'

import { readPullRequestPatch, type ProcessPullRequestDiff } from '../pull-request-patch.mts'

const TARGET = {
  mergeCommitOid: undefined,
  number: 386,
  owner: 'vouchington',
  repo: 'vouchington',
  state: 'OPEN',
}

function blocks(...patches: string[]): ProcessPullRequestDiff {
  return async onBlock => {
    for (const patch of patches) await onBlock(patch)
  }
}

function diffFailure(): DiffCommandError {
  return new DiffCommandError({ executable: 'gh', args: ['pr', 'diff'] }, { stderr: 'too large' })
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
      async () => {
        throw diffFailure()
      },
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
      TARGET,
    )

    expect(calls).toEqual([
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
    expect(result.summary.removedSurfaces).toContainEqual({
      path: 'web/app/retired/page.tsx',
      type: 'deleted-file',
    })
    expect(result.summary.changedPackageJsonPaths).toEqual(['package.json'])
  })

  it('labels the normal unified diff source', async () => {
    await expect(
      readPullRequestPatch(blocks('diff --git a/a b/a\n+added'), async () => '', TARGET),
    ).resolves.toMatchObject({ source: 'unified-diff', summary: { lineChanges: { added: 1 } } })
  })

  it('accepts a complete 3000-file API response', async () => {
    const result = await readPullRequestPatch(
      async () => {
        throw diffFailure()
      },
      runGhAtFileLimit(3000),
      TARGET,
    )
    expect(result.source).toBe('files-api')
    expect(result.summary.removedSurfaces).toContainEqual({
      path: 'retired/file-2999.ts',
      type: 'deleted-file',
    })
  })

  it('rejects a truncated 3000-file API response', async () => {
    await expect(
      readPullRequestPatch(
        async () => {
          throw diffFailure()
        },
        runGhAtFileLimit(3001),
        TARGET,
      ),
    ).rejects.toBeInstanceOf(DiffCommandError)
  })

  it('preserves the original diff failure when the files API cannot recover it', async () => {
    const diffError = diffFailure()
    await expect(
      readPullRequestPatch(
        async () => Promise.reject(diffError),
        async () => Promise.reject(new Error('files unavailable')),
        TARGET,
      ),
    ).rejects.toBe(diffError)
  })

  it('does not call the files API for a parser failure', async () => {
    const parserError = new Error('parser failure')
    let calls = 0
    await expect(
      readPullRequestPatch(
        async () => Promise.reject(parserError),
        async () => {
          calls += 1
          return '[]'
        },
        TARGET,
      ),
    ).rejects.toBe(parserError)
    expect(calls).toBe(0)
  })

  it('discards provisional blocks before a typed transport fallback', async () => {
    const result = await readPullRequestPatch(
      async onBlock => {
        await onBlock('diff --git a/a b/a\n+partial')
        throw diffFailure()
      },
      async () => JSON.stringify([{ filename: 'b', patch: '+final', status: 'modified' }]),
      TARGET,
    )
    expect(result.summary.lineChanges).toEqual({ added: 1, deleted: 0 })
  })
})
