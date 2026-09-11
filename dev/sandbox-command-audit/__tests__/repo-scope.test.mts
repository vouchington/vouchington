import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { isWithinRepoRoots, resolveRepoRoots } from '../repo-scope.mts'

describe('isWithinRepoRoots', () => {
  // These roots and candidates are all nonexistent paths — safeRealpath's ENOENT
  // fallback returns the literal string unchanged, so canonicalization is a no-op here
  // and the lexical boundary check is exercised directly.
  it('matches the root itself and a nested path', async () => {
    await expect(isWithinRepoRoots('/repo', ['/repo'])).resolves.toBe(true)
    await expect(isWithinRepoRoots(join('/repo', 'sub', 'dir'), ['/repo'])).resolves.toBe(true)
  })

  it('rejects a sibling directory that merely shares a string prefix', async () => {
    await expect(isWithinRepoRoots('/repo-two', ['/repo'])).resolves.toBe(false)
    await expect(isWithinRepoRoots('/repo-two/sub', ['/repo'])).resolves.toBe(false)
  })

  it('matches when any of several roots contains the cwd', async () => {
    await expect(isWithinRepoRoots('/other/sub', ['/repo', '/other'])).resolves.toBe(true)
  })

  it('returns false for an empty roots list', async () => {
    await expect(isWithinRepoRoots('/repo', [])).resolves.toBe(false)
  })

  describe('symlink canonicalization', () => {
    let root: string

    afterEach(() => {
      if (root) rmSync(root, { recursive: true, force: true })
    })

    it('matches a candidate reached through a symlink against the real root path', async () => {
      root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
      const realRootPath = join(root, 'real-repo')
      mkdirSync(join(realRootPath, 'sub'), { recursive: true })
      // resolveRepoRoots always canonicalizes roots before isWithinRepoRoots ever sees
      // them — mirror that here rather than depending on whether the OS temp directory
      // itself has a symlink component (e.g. macOS's /tmp -> /private/tmp).
      const realRoot = realpathSync(realRootPath)
      const linkedRoot = join(root, 'linked-repo')
      symlinkSync(realRootPath, linkedRoot)

      await expect(isWithinRepoRoots(join(linkedRoot, 'sub'), [realRoot])).resolves.toBe(true)
    })
  })
})

describe('resolveRepoRoots', () => {
  function throwingDeps() {
    return {
      gitCommonDir: () => {
        throw new Error('gitCommonDir should not be called when explicit roots are given')
      },
      gitWorktreeList: () => {
        throw new Error('gitWorktreeList should not be called when explicit roots are given')
      },
    }
  }

  it('returns explicit roots (minimized) without invoking git', async () => {
    const roots = await resolveRepoRoots(
      ['/repo', join('/repo', 'nested')],
      '/anything',
      throwingDeps(),
    )
    expect(roots).toEqual(['/repo'])
  })

  it('falls back to git-resolved roots when explicit is undefined', async () => {
    const roots = await resolveRepoRoots(undefined, '/repo', {
      gitCommonDir: async () => join('/repo', '.git'),
      gitWorktreeList: async () => ['/repo'],
    })
    expect(roots).toEqual(['/repo'])
  })

  it('falls back to git-resolved roots when explicit is an empty array', async () => {
    const roots = await resolveRepoRoots([], '/repo', {
      gitCommonDir: async () => join('/repo', '.git'),
      gitWorktreeList: async () => ['/repo'],
    })
    expect(roots).toEqual(['/repo'])
  })

  it('unions the main checkout root with worktree list roots and minimizes the result', async () => {
    const roots = await resolveRepoRoots(undefined, '/repo', {
      gitCommonDir: async () => join('/repo', '.git'),
      gitWorktreeList: async () => [
        '/repo',
        join('/repo', 'nested-worktree'),
        join('/elsewhere', 'outside-worktree'),
      ],
    })
    expect(roots.sort()).toEqual(['/elsewhere/outside-worktree', '/repo'].sort())
  })

  it('resolves a relative explicit root against cwd, not the process cwd', async () => {
    const roots = await resolveRepoRoots(['nested/path'], '/work/dir', throwingDeps())
    expect(roots).toEqual(['/work/dir/nested/path'])
  })

  describe('symlink canonicalization', () => {
    let root: string

    afterEach(() => {
      if (root) rmSync(root, { recursive: true, force: true })
    })

    it('canonicalizes an explicit root reached through a symlink', async () => {
      root = mkdtempSync(join(tmpdir(), 'sandbox-audit-repo-scope-'))
      const realRootPath = join(root, 'real-repo')
      mkdirSync(realRootPath, { recursive: true })
      // Canonicalize the expected value too, so this test doesn't depend on whether
      // the OS temp directory itself contains a symlink component (e.g. macOS's
      // /tmp -> /private/tmp).
      const realRoot = realpathSync(realRootPath)
      const linkedRoot = join(root, 'linked-repo')
      symlinkSync(realRootPath, linkedRoot)

      const roots = await resolveRepoRoots([linkedRoot], '/anything', throwingDeps())
      expect(roots).toEqual([realRoot])
    })
  })
})
