import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  makeTempRepo,
  removeTempRepos,
  runGit,
  writeRepoFile,
} from '../test-helpers/knip-production-exports/temp-repo.mts'
import { createGit, type Git } from './git.mts'
import { listTestFiles, withTestFilesRemoved } from './test-files.mts'

const TESTS = [
  'backend/pkg/thing.test.mts',
  'backend/pkg/__tests__/case.mts',
  'backend/pkg/test-helpers.mts',
  'backend/pkg/thing.test-helpers.mts',
  'backend/test-helpers/entities/builder.mts',
  'backend/pkg/[id].test.mts',
]
const KEEP = [
  'backend/pkg/thing.mts',
  'backend/test-helpers/package.json',
  'web/thing.test.mts',
  'static-code-analysis/knip-production-exports/report.test.mts',
]

const seed = () => makeTempRepo(Object.fromEntries([...TESTS, ...KEEP].map(f => [f, `// ${f}\n`])))
const removeIn = (dir: string) => async (file: string) => rmSync(join(dir, file), { force: true })

describe('listTestFiles', () => {
  afterEach(removeTempRepos)

  it('lists tracked backend test files only, including glob-looking names', async () => {
    const dir = seed()
    expect((await listTestFiles(createGit(dir))).toSorted()).toEqual(TESTS.toSorted())
  })

  it('does not list untracked files', async () => {
    const dir = seed()
    writeRepoFile(dir, 'backend/pkg/new.test.mts', 'x')
    expect(await listTestFiles(createGit(dir))).not.toContain('backend/pkg/new.test.mts')
  })
})

describe('withTestFilesRemoved', () => {
  afterEach(removeTempRepos)

  it('deletes the test files while the callback runs and restores them exactly', async () => {
    const dir = seed()
    const seen: boolean[] = []
    const removed: number[] = []
    const value = await withTestFilesRemoved(
      { git: createGit(dir), onRemoved: count => removed.push(count), remove: removeIn(dir) },
      async () => {
        seen.push(
          ...TESTS.map(f => existsSync(join(dir, f))),
          ...KEEP.map(f => existsSync(join(dir, f))),
        )
        return 'done'
      },
    )
    expect(value).toBe('done')
    expect(removed).toEqual([TESTS.length])
    expect(seen).toEqual([...TESTS.map(() => false), ...KEEP.map(() => true)])
    for (const file of TESTS) expect(readFileSync(join(dir, file), 'utf8')).toBe(`// ${file}\n`)
    expect(runGit(dir, 'status', '--porcelain')).toBe('')
  })

  it('restores the files and rethrows when the callback fails', async () => {
    const dir = seed()
    const run = withTestFilesRemoved({ git: createGit(dir), remove: removeIn(dir) }, async () =>
      Promise.reject(new Error('knip crashed')),
    )
    await expect(run).rejects.toThrow('knip crashed')
    expect(runGit(dir, 'status', '--porcelain')).toBe('')
  })

  it.each([
    ['modified', (dir: string) => writeRepoFile(dir, TESTS[0]!, 'edited')],
    ['deleted', (dir: string) => rmSync(join(dir, TESTS[0]!))],
    ['untracked', (dir: string) => writeRepoFile(dir, 'backend/pkg/fresh.test.mts', 'new')],
    [
      'staged',
      (dir: string) => {
        writeRepoFile(dir, TESTS[1]!, 'staged')
        runGit(dir, 'add', TESTS[1]!)
      },
    ],
  ])('refuses to run when a test file is %s and touches nothing', async (_name, dirty) => {
    const dir = seed()
    dirty(dir)
    const before = runGit(dir, 'status', '--porcelain')
    let called = false
    const run = withTestFilesRemoved({ git: createGit(dir), remove: removeIn(dir) }, async () => {
      called = true
    })
    await expect(run).rejects.toThrow('Refusing to run')
    expect(called).toBe(false)
    expect(runGit(dir, 'status', '--porcelain')).toBe(before)
  })

  it('points at git restore when the leftovers look like a killed run', async () => {
    const dir = seed()
    rmSync(join(dir, TESTS[0]!))
    const run = withTestFilesRemoved({ git: createGit(dir), remove: removeIn(dir) }, async () => 1)
    await expect(run).rejects.toThrow('deletions from a run that was killed')
  })

  it('lists only some of many dirty files', async () => {
    const dir = seed()
    for (let index = 0; index < 22; index += 1) {
      writeRepoFile(dir, `backend/pkg/extra${index}.test.mts`, 'new')
    }
    const run = withTestFilesRemoved({ git: createGit(dir), remove: removeIn(dir) }, async () => 1)
    await expect(run).rejects.toThrow('...and 2 more')
  })

  it('refuses when no tracked file matches, since the check would silently pass', async () => {
    const dir = makeTempRepo({ 'backend/pkg/thing.mts': 'x' })
    const run = withTestFilesRemoved({ git: createGit(dir), remove: removeIn(dir) }, async () => 1)
    await expect(run).rejects.toThrow('No tracked files match')
  })

  it('tells the reader how to restore by hand when the restore itself fails', async () => {
    const dir = seed()
    const real = createGit(dir)
    const git: Git = (args, input) =>
      args.includes('restore') ? Promise.reject(new Error('index.lock exists')) : real(args, input)
    const run = withTestFilesRemoved({ git, remove: removeIn(dir) }, async () =>
      Promise.reject(new Error('knip crashed')),
    )
    await expect(run).rejects.toThrow(`Could not restore ${TESTS.length} deleted test files`)
    await expect(run).rejects.toThrow('index.lock exists')
    await expect(run).rejects.toThrow('knip crashed')
    await expect(run).rejects.toThrow(
      "git restore --source=HEAD --worktree -- ':(glob)backend/**/*.test.mts'",
    )
    await expect(run).rejects.toHaveProperty('cause', expect.any(Error))
  })

  it('reports a failed restore even when the callback succeeded', async () => {
    const dir = seed()
    const real = createGit(dir)
    const git: Git = (args, input) =>
      args.includes('restore') ? Promise.reject(new Error('disk full')) : real(args, input)
    const run = withTestFilesRemoved({ git, remove: removeIn(dir) }, async () => 'fine')
    await expect(run).rejects.toThrow('disk full')
    await expect(run).rejects.not.toThrow('had failed first')
  })
})
