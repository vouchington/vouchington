import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  gitConfigValue,
  gitConfiguredRemoteDefaults,
  gitCurrentBranch,
  gitHeadPathExists,
  gitIsAncestor,
  gitRemoteVerbose,
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

  it('preserves raw remote output and treats no configured remote default as empty', async () => {
    await withRepo({ origin: 'git@github.com:acme/tool.git' }, dir => {
      expect(gitRemoteVerbose(dir)).toContain('origin\tgit@github.com:acme/tool.git (fetch)')
      expect(gitConfiguredRemoteDefaults(dir)).toBe('')
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
})
