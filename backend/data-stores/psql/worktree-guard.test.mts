import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { assertNotCrossWorktreeConnection } from './worktree-guard.mts'

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
      ).toThrow('targets database "voucha"')
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

    it('allows the extracted database name voucha-my-feature from a non-main worktree', () => {
      const dir = makeNonMainWorktreeDir()
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha-my-feature', {
          env: {},
          moduleDir: dir,
        }),
      ).not.toThrow()
    })

    it('allows another extracted database name from a non-main worktree', () => {
      const dir = makeNonMainWorktreeDir()
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://user@host:5432/mydb', {
          env: {},
          moduleDir: dir,
        }),
      ).not.toThrow()
    })

    it('allows a connection string that does not name a database', () => {
      const dir = makeNonMainWorktreeDir()
      expect(() =>
        assertNotCrossWorktreeConnection('not-a-url', {
          env: {},
          moduleDir: dir,
        }),
      ).not.toThrow()
    })

    it('resolves the repository from its own module directory when none is injected', () => {
      expect(() =>
        assertNotCrossWorktreeConnection('postgres://localhost/voucha-default-module-dir', {
          env: {},
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
      ).toThrow('targets database "voucha"')
    })
  })
})
