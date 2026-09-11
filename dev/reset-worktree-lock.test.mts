import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readdir, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { sourceBashArgs } from './test-helpers/initialize.mts'

describe('reset-worktree lock', () => {
  const execFileAsync = promisify(execFile)
  const helperPath = fileURLToPath(new URL('./lib/reset-worktree-lock.sh', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeRepoRoot() {
    const dir = await mkdtemp(join(tmpdir(), 'voucha-reset-lock-'))
    testDirs.push(dir)
    return dir
  }

  function run(script: string, repoRoot: string) {
    return execFileAsync('bash', sourceBashArgs(helperPath, script, [repoRoot]), {
      env: { ...process.env },
    })
  }

  const lockFile = (repoRoot: string) => join(repoRoot, '.local', 'reset-worktree.lock')

  it('blocks a second acquire until the owner releases, then reacquires', async () => {
    const repoRoot = await makeRepoRoot()
    const { stdout } = await run(
      `
      reset_worktree_lock_acquire "$1"
      if (unset RESET_WORKTREE_LOCK_TOKEN; reset_worktree_lock_acquire "$1") 2>/dev/null; then
        printf concurrent
      else
        printf blocked
      fi
      reset_worktree_lock_release "$1"
      reset_worktree_lock_acquire "$1"
      printf ':reacquired'
      reset_worktree_lock_release "$1"
      `,
      repoRoot,
    )

    expect(stdout.trim()).toBe('blocked:reacquired')
  })

  it('never removes a lock another owner holds', async () => {
    const repoRoot = await makeRepoRoot()
    const { stdout } = await run(
      `
      reset_worktree_lock_acquire "$1"
      ln -sf owner.424242.9 "$1/.local/reset-worktree.lock"
      reset_worktree_lock_release "$1"
      readlink "$1/.local/reset-worktree.lock"
      `,
      repoRoot,
    )

    expect(stdout.trim()).toBe('owner.424242.9')
  })

  it('refuses to acquire when the lock path is a symlink to a directory', async () => {
    // Reproduces the hazard `ln -s` has when its LINK_NAME argument is itself a symlink
    // resolving to a directory: `ln -s "$token" "$lock_path"` places a new link named
    // "$token" *inside* that directory instead of replacing lock_path, and still exits 0.
    const repoRoot = await makeRepoRoot()
    await mkdir(join(repoRoot, '.local', 'some-dir'), { recursive: true })
    await symlink('some-dir', lockFile(repoRoot))

    const { stdout } = await run(
      `
      if reset_worktree_lock_acquire "$1" 2>/dev/null; then
        printf acquired
      else
        printf refused
      fi
      printf ':%s' "$RESET_WORKTREE_LOCK_TOKEN"
      `,
      repoRoot,
    )

    expect(stdout.trim()).toBe('refused:')
    expect(await readlink(lockFile(repoRoot))).toBe('some-dir')
    await expect(readdir(join(repoRoot, '.local', 'some-dir'))).resolves.toEqual([])
  })

  it('is idempotent when no token is held', async () => {
    const repoRoot = await makeRepoRoot()
    const { stdout } = await run(
      `
      reset_worktree_lock_release "$1"
      reset_worktree_lock_release "$1"
      printf ok
      `,
      repoRoot,
    )

    expect(stdout.trim()).toBe('ok')
  })

  it('reports missing when no lock is present', async () => {
    const repoRoot = await makeRepoRoot()
    const { stdout } = await run(
      `
      reset_worktree_lock_clear_stale "$1"
      status=$?
      printf '%s:%s' "$RESET_WORKTREE_LOCK_CLEANUP_STATUS" "$status"
      `,
      repoRoot,
    )

    expect(stdout.trim()).toBe('missing:0')
  })

  it('reports invalid for a non-symlink entry at the lock path', async () => {
    const repoRoot = await makeRepoRoot()
    await mkdir(join(repoRoot, '.local'), { recursive: true })
    await writeFile(lockFile(repoRoot), 'not a lock')

    const { stdout } = await run(
      `
      reset_worktree_lock_clear_stale "$1"
      status=$?
      printf '%s:%s' "$RESET_WORKTREE_LOCK_CLEANUP_STATUS" "$status"
      `,
      repoRoot,
    )

    expect(stdout.trim()).toBe('invalid:1')
    await expect(lstat(lockFile(repoRoot))).resolves.toBeDefined()
  })

  it('removes a stale lock left by a dead owner', async () => {
    const repoRoot = await makeRepoRoot()
    await mkdir(join(repoRoot, '.local'), { recursive: true })
    await symlink('owner.999999.1', lockFile(repoRoot))

    const { stdout } = await run(
      `
      reset_worktree_lock_clear_stale "$1"
      status=$?
      printf '%s:%s' "$RESET_WORKTREE_LOCK_CLEANUP_STATUS" "$status"
      `,
      repoRoot,
    )

    expect(stdout.trim()).toBe('removed:0')
    await expect(lstat(lockFile(repoRoot))).rejects.toThrow('ENOENT')
  })

  it('refuses to remove a lock whose owner is still alive', async () => {
    const repoRoot = await makeRepoRoot()
    await mkdir(join(repoRoot, '.local'), { recursive: true })

    const { stdout } = await run(
      `
      ln -s "owner.$$.1" "$1/.local/reset-worktree.lock"
      reset_worktree_lock_clear_stale "$1"
      status=$?
      printf '%s:%s' "$RESET_WORKTREE_LOCK_CLEANUP_STATUS" "$status"
      `,
      repoRoot,
    )

    expect(stdout.trim()).toBe('active:1')
    await expect(lstat(lockFile(repoRoot))).resolves.toBeDefined()
  })

  for (const badToken of ['not-a-token', 'owner.123', 'owner..1']) {
    it(`reports invalid and preserves the lock for a malformed token (${badToken})`, async () => {
      const repoRoot = await makeRepoRoot()
      await mkdir(join(repoRoot, '.local'), { recursive: true })
      await symlink(badToken, lockFile(repoRoot))

      const { stdout } = await run(
        `
        reset_worktree_lock_clear_stale "$1"
        status=$?
        printf '%s:%s' "$RESET_WORKTREE_LOCK_CLEANUP_STATUS" "$status"
        `,
        repoRoot,
      )

      expect(stdout.trim()).toBe('invalid:1')
      expect(await readlink(lockFile(repoRoot))).toBe(badToken)
    })
  }
})
