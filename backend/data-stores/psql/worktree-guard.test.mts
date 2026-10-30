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
      expect(
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: { CI: 'true' },
          moduleDir: dir,
        }),
      ).toEqual({ allowedBecause: 'ci', databaseName: 'voucha' })
    })

    it('skips the check when DOCKER_HOST_IP is set', () => {
      const dir = makeNonMainWorktreeDir()
      expect(
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: { DOCKER_HOST_IP: '172.17.0.1' },
          moduleDir: dir,
        }),
      ).toEqual({ allowedBecause: 'docker-host', databaseName: 'voucha' })
    })

    it('skips the check when no repo root is found', () => {
      // /tmp itself is a git directory on some machines, so a temp dir there walks up to it.
      const isolated = mkdtempSync(join('/dev/shm', 'voucha-worktree-guard-'))
      try {
        expect(
          assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
            env: {},
            moduleDir: isolated,
          }),
        ).toEqual({ allowedBecause: 'no-repo-root', databaseName: 'voucha' })
      } finally {
        rmSync(isolated, { force: true, recursive: true })
      }
    })

    it('allows main worktree to connect to voucha', () => {
      const dir = makeMainWorktreeDir()
      expect(
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: {},
          moduleDir: dir,
        }),
      ).toEqual({ allowedBecause: 'main-worktree', databaseName: 'voucha', repoRoot: dir })
    })

    it('walks up to the main worktree root', () => {
      const dir = makeMainWorktreeDir()
      const nested = join(dir, 'data-stores', 'psql')
      mkdirSync(nested, { recursive: true })
      expect(
        assertNotCrossWorktreeConnection('postgres://localhost/voucha', {
          env: {},
          moduleDir: nested,
        }),
      ).toEqual({ allowedBecause: 'main-worktree', databaseName: 'voucha', repoRoot: dir })
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
      expect(
        assertNotCrossWorktreeConnection('postgres://localhost/voucha-my-feature', {
          env: {},
          moduleDir: dir,
        }),
      ).toEqual({
        allowedBecause: 'worktree-database',
        databaseName: 'voucha-my-feature',
        repoRoot: dir,
      })
    })

    it('allows another extracted database name from a non-main worktree', () => {
      const dir = makeNonMainWorktreeDir()
      expect(
        assertNotCrossWorktreeConnection('postgres://user@host:5432/mydb', {
          env: {},
          moduleDir: dir,
        }),
      ).toEqual({ allowedBecause: 'worktree-database', databaseName: 'mydb', repoRoot: dir })
    })

    it('allows a connection string that does not name a database', () => {
      const dir = makeNonMainWorktreeDir()
      expect(
        assertNotCrossWorktreeConnection('not-a-url', {
          env: {},
          moduleDir: dir,
        }),
      ).toEqual({ allowedBecause: 'worktree-database', databaseName: null, repoRoot: dir })
    })

    it('resolves the repository from its own module directory when none is injected', () => {
      const decision = assertNotCrossWorktreeConnection(
        'postgres://localhost/voucha-default-module-dir',
        { env: {} },
      )
      expect(decision.databaseName).toBe('voucha-default-module-dir')
      if (
        decision.allowedBecause !== 'main-worktree' &&
        decision.allowedBecause !== 'worktree-database'
      ) {
        throw new Error(`expected a repository decision, got ${decision.allowedBecause}`)
      }
      expect(decision.repoRoot).toEqual(expect.any(String))
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
