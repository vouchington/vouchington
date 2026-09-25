import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  assertNotCrossWorktreeConnection,
  databaseNameFromConnectionString,
  findRepoRoot,
  isNonMainWorktree,
} from './worktree-guard.mts'

const testRoot = mkdtempSync(join(tmpdir(), 'voucha-worktree-guard-'))

function makeMainWorktreeDir(): string {
  const dir = mkdtempSync(join(testRoot, 'main-'))
  mkdirSync(join(dir, '.git'))
  return dir
}

function makeNonMainWorktreeDir(): string {
  const dir = mkdtempSync(join(testRoot, 'sub-'))
  writeFileSync(join(dir, '.git'), 'gitdir: /fake/.git/worktrees/sub\n')
  return dir
}

describe('worktree-guard', () => {
  afterAll(() => rmSync(testRoot, { force: true, recursive: true }))

  describe('databaseNameFromConnectionString', () => {
    it('extracts the database name from a postgres URL', () => {
      expect(databaseNameFromConnectionString('postgres://localhost/voucha')).toBe('voucha')
      expect(databaseNameFromConnectionString('postgres://localhost/voucha-my-feature')).toBe(
        'voucha-my-feature',
      )
      expect(databaseNameFromConnectionString('postgres://user@host:5432/mydb')).toBe('mydb')
    })

    it('returns null for an invalid URL', () => {
      expect(databaseNameFromConnectionString('not-a-url')).toBeNull()
    })
  })

  describe('findRepoRoot', () => {
    it('finds the root when .git exists in the start dir', () => {
      const dir = makeMainWorktreeDir()
      expect(findRepoRoot(dir)).toBe(dir)
    })

    it('finds the root by walking up', () => {
      const dir = makeMainWorktreeDir()
      const nested = join(dir, 'a', 'b', 'c')
      mkdirSync(nested, { recursive: true })
      expect(findRepoRoot(nested)).toBe(dir)
    })

    it('returns null when no .git is found', () => {
      const isolated = mkdtempSync(join(testRoot, 'no-git-'))
      expect(findRepoRoot(isolated, testRoot)).toBeNull()
    })
  })

  describe('isNonMainWorktree', () => {
    it('returns false when .git is a directory (main worktree)', () => {
      const dir = makeMainWorktreeDir()
      expect(isNonMainWorktree(dir)).toBe(false)
    })

    it('returns true when .git is a file (non-main worktree)', () => {
      const dir = makeNonMainWorktreeDir()
      expect(isNonMainWorktree(dir)).toBe(true)
    })

    it('returns false when .git does not exist', () => {
      const dir = mkdtempSync(join(testRoot, 'no-git-'))
      expect(isNonMainWorktree(dir)).toBe(false)
    })
  })

  describe('assertNotCrossWorktreeConnection', () => {
    it('skips the check in CI', () => {
      const dir = makeNonMainWorktreeDir()
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: { CI: 'true' },
          moduleDir: dir,
        }),
      ).not.toThrow()
    })

    it('skips the check when DOCKER_HOST_IP is set', () => {
      const dir = makeNonMainWorktreeDir()
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: { DOCKER_HOST_IP: '172.17.0.1' },
          moduleDir: dir,
        }),
      ).not.toThrow()
    })

    it('skips the check when no repo root is found', () => {
      const isolated = mkdtempSync(join(testRoot, 'no-git-'))
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: {},
          moduleDir: isolated,
        }),
      ).not.toThrow()
    })

    it('allows main worktree to connect to voucha', () => {
      const dir = makeMainWorktreeDir()
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: {},
          moduleDir: dir,
        }),
      ).not.toThrow()
    })

    it('throws when a non-main worktree targets the main voucha database', () => {
      const dir = makeNonMainWorktreeDir()
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: {},
          moduleDir: dir,
        }),
      ).toThrow('Cross-worktree database guard')
    })

    it('throws with helpful instructions', () => {
      const dir = makeNonMainWorktreeDir()
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: {},
          moduleDir: dir,
        }),
      ).toThrow('./dev/initialize web')
    })

    it('allows a non-main worktree to connect to its own database', () => {
      const dir = makeNonMainWorktreeDir()
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha-my-feature', {
          env: {},
          moduleDir: dir,
        }),
      ).not.toThrow()
    })

    it('also blocks when nested in subdirectory of non-main worktree', () => {
      const dir = makeNonMainWorktreeDir()
      const nested = join(dir, 'data-stores', 'psql')
      mkdirSync(nested, { recursive: true })
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: {},
          moduleDir: nested,
        }),
      ).toThrow('Cross-worktree database guard')
    })
  })
})
