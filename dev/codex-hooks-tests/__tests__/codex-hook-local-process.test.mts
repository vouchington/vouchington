import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  gitConfigValue,
  gitCurrentBranch,
  gitHeadPathExists,
  gitIsAncestor,
  gitResolveRef,
  oxfmtFailure,
} from '../../codex-hooks/local-process.mts'
import { git, withRepo } from '../git-remote-repo.mts'
import { withTestTempDir } from '../test-temp-root.mts'

describe('codex hook local process boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('reads the current branch and configured key without worktree overrides', async () => {
    await withRepo({}, dir => {
      const branch = gitCurrentBranch(dir)
      expect(branch).toBeTruthy()
      git(dir, 'config', `branch.${branch}.gh-merge-base`, 'feature-auth')
      vi.stubEnv('GIT_DIR', join(dir, 'missing-git-dir'))
      expect(gitConfigValue(dir, `branch.${branch}.gh-merge-base`)).toBe('feature-auth')
    })
  })

  it('distinguishes ancestor, non-ancestor, and indeterminate merge-base exits', async () => {
    await withTestTempDir('voucha-local-process-', async dir => {
      git(dir, 'init', '-q', '-b', 'main')
      git(dir, 'config', 'user.name', 'Codex Hooks Test')
      git(dir, 'config', 'user.email', 'codex-hooks-test@example.test')
      git(dir, 'commit', '-q', '--allow-empty', '-m', 'initial')
      git(dir, 'update-ref', 'refs/remotes/origin/main', 'refs/heads/main')
      expect(gitIsAncestor(dir, 'HEAD', 'origin/main')).toBe(true)
      git(dir, 'checkout', '-q', '-b', 'feature-auth')
      git(dir, 'commit', '-q', '--allow-empty', '-m', 'feature')
      expect(gitIsAncestor(dir, 'HEAD', 'origin/main')).toBe(false)
      expect(gitIsAncestor(dir, 'unknown-ref', 'HEAD')).toBeUndefined()
      expect(gitResolveRef(dir, 'refs/remotes/origin/main')).toMatch(/^[0-9a-f]{40}$/)
      expect(gitResolveRef(dir, 'refs/heads/missing')).toBeUndefined()
    })
  })

  it('checks HEAD-relative path existence', async () => {
    await withTestTempDir('voucha-local-process-', async dir => {
      git(dir, 'init', '-q', '-b', 'main')
      git(dir, 'config', 'user.name', 'Codex Hooks Test')
      git(dir, 'config', 'user.email', 'codex-hooks-test@example.test')
      writeFileSync(join(dir, 'package.json'), '{}\n')
      git(dir, 'add', 'package.json')
      git(dir, 'commit', '-q', '-m', 'package')
      expect(gitHeadPathExists(dir, 'package.json')).toBe(true)
      expect(gitHeadPathExists(dir, 'missing.json')).toBe(false)
    })
  })

  it('fails open when oxfmt is unavailable', async () => {
    await withTestTempDir('voucha-local-process-', async dir => {
      vi.stubEnv('PATH', '')
      expect(oxfmtFailure(dir, join(dir, 'missing.yml'))).toBeUndefined()
    })
  })
})
