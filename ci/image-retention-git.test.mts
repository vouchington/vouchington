import { execFileSync } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, onTestFinished } from 'vitest'

import { loadMainReachability } from './image-retention-git.mts'
import { mainRepository } from './image-retention-git-test-fixture.mts'

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()

describe('main history membership', () => {
  it('returns one pinned full ancestor set', async () => {
    const { directory, shas, tip } = await mainRepository(3)

    const result = await loadMainReachability({ cwd: directory })

    expect(result.tip).toBe(tip)
    expect([...result.reachable]).toEqual(shas.toReversed())
  })

  it('classifies an orphan absent from the object database without probing the candidate', async () => {
    const { directory, shas } = await mainRepository(2)
    git(directory, 'switch', '--quiet', '--orphan', 'queued')
    await writeFile(join(directory, 'fixture'), 'queued\n')
    git(directory, 'add', 'fixture')
    git(directory, 'commit', '--quiet', '-m', 'synthetic-queue')
    const orphan = git(directory, 'rev-parse', 'HEAD')
    git(directory, 'switch', '--quiet', 'main')
    git(directory, 'branch', '-D', 'queued')
    git(directory, 'reflog', 'expire', '--expire=now', '--all')
    git(directory, 'gc', '--prune=now', '--quiet')

    const result = await loadMainReachability({ cwd: directory })

    expect(result.reachable.has(orphan)).toBe(false)
    expect([...result.reachable]).toEqual(shas.toReversed())
    expect(() =>
      execFileSync('git', ['cat-file', '-e', `${orphan}^{commit}`], {
        cwd: directory,
        stdio: 'ignore',
      }),
    ).toThrow(Error)
  })

  it('rejects shallow history and a local main tip different from origin/main', async () => {
    const source = await mainRepository(2)
    const shallow = await mkdtemp(join(tmpdir(), 'image-retention-shallow-'))
    onTestFinished(() => rm(shallow, { force: true, recursive: true }))
    execFileSync('git', ['clone', '--quiet', '--depth', '1', `file://${source.directory}`, shallow])
    await expect(loadMainReachability({ cwd: shallow })).rejects.toThrow(
      'main reachability proof failed',
    )

    git(source.directory, 'update-ref', 'refs/remotes/origin/main', source.shas[0]!)
    await expect(loadMainReachability({ cwd: source.directory })).rejects.toThrow(
      'main reachability proof failed',
    )
  })
})
