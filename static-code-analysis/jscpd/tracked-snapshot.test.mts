import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { copyTrackedWorkingTree } from './tracked-snapshot.mts'

async function fixture(run: (repo: string, snapshot: string) => Promise<void>): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'jscpd-tracked-snapshot-test-'))
  const repo = join(root, 'repo')
  const snapshot = join(root, 'snapshot')
  try {
    await mkdir(repo)
    execFileSync('git', ['init', '-q'], { cwd: repo })
    await run(repo, snapshot)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe('jscpd tracked working-tree snapshot', () => {
  it('copies edited tracked bytes while excluding untracked importers and gitignore metadata', async () => {
    await fixture(async (repo, snapshot) => {
      await writeFile(join(repo, 'orphan.mts'), 'export const original = 1\n')
      execFileSync('git', ['add', 'orphan.mts'], { cwd: repo })
      await writeFile(join(repo, 'orphan.mts'), 'export const edited = 2\n')
      await writeFile(join(repo, 'importer.mts'), "import './orphan.mts'\n")
      await writeFile(join(repo, '.gitignore'), 'orphan.mts\n')
      expect(await copyTrackedWorkingTree(repo, snapshot)).toBe(1)
      expect(await readFile(join(snapshot, 'orphan.mts'), 'utf8')).toBe('export const edited = 2\n')
      await expect(readFile(join(snapshot, 'importer.mts'))).rejects.toThrow('ENOENT')
      await expect(readFile(join(snapshot, '.gitignore'))).rejects.toThrow('ENOENT')
    })
  })

  it('retains internal symlinks and rejects links escaping the repository', async () => {
    await fixture(async (repo, snapshot) => {
      await writeFile(join(repo, 'target.mts'), 'export const target = 1\n')
      await symlink('target.mts', join(repo, 'internal.mts'))
      execFileSync('git', ['add', 'target.mts', 'internal.mts'], { cwd: repo })
      await copyTrackedWorkingTree(repo, snapshot)
      expect(await readFile(join(snapshot, 'internal.mts'), 'utf8')).toBe(
        'export const target = 1\n',
      )
    })
    await fixture(async (repo, snapshot) => {
      await symlink('/etc/hosts', join(repo, 'external.mts'))
      execFileSync('git', ['add', 'external.mts'], { cwd: repo })
      await expect(copyTrackedWorkingTree(repo, snapshot)).rejects.toThrow('Tracked path escapes')
    })
    await fixture(async (repo, snapshot) => {
      await mkdir(join(repo, 'sub'))
      await writeFile(join(repo, 'sub', 'inside.mts'), 'export const inside = 1\n')
      execFileSync('git', ['add', 'sub/inside.mts'], { cwd: repo })
      await rm(join(repo, 'sub'), { recursive: true })
      const outside = join(dirname(repo), 'outside')
      await mkdir(outside)
      await writeFile(join(outside, 'inside.mts'), 'export const outside = 2\n')
      await symlink(outside, join(repo, 'sub'))
      await expect(copyTrackedWorkingTree(repo, snapshot)).rejects.toThrow('Tracked path escapes')
    })
  })
})
