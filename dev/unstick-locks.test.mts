import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { sourceBashArgs } from './test-helpers/initialize.mts'

describe('./dev/unstick-locks and the reset-worktree lock (#10849)', () => {
  const execFileAsync = promisify(execFile)
  const devDir = fileURLToPath(new URL('.', import.meta.url))
  const lockHelperPath = join(devDir, 'lib', 'reset-worktree-lock.sh')
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  // A real git repo (not a fake-bin fixture) so ./dev/unstick-locks's own git plumbing
  // (rev-parse --git-dir / --git-common-dir) needs no shim.
  async function makeRepo() {
    const repo = await mkdtemp(join(tmpdir(), 'voucha-unstick-locks-'))
    testDirs.push(repo)
    await execFileAsync('git', ['init', '-q', repo])
    await mkdir(join(repo, 'dev', 'lib'), { recursive: true })
    for (const relativePath of [
      'unstick-locks',
      'lib/refuse-on-main.sh',
      'lib/worktree-resource-env.sh',
      'lib/db-name-from-url.sh',
      'lib/reset-worktree-lock.sh',
    ]) {
      const destination = join(repo, 'dev', relativePath)
      await writeFile(destination, await readFile(join(devDir, relativePath), 'utf8'))
      if (!relativePath.startsWith('lib/')) await execFileAsync('chmod', ['0755', destination])
    }
    return repo
  }

  async function makeIsolatedHome() {
    const home = await mkdtemp(join(tmpdir(), 'voucha-unstick-locks-home-'))
    testDirs.push(home)
    return home
  }

  function lockPath(repo: string) {
    return join(repo, '.local', 'reset-worktree.lock')
  }

  async function runUnstickLocks(repo: string, home: string) {
    try {
      const result = await execFileAsync('bash', [join(repo, 'dev', 'unstick-locks')], {
        cwd: repo,
        env: { ...process.env, HOME: home },
      })
      return { exitCode: 0, stdout: result.stdout }
    } catch (err: unknown) {
      const e = err as { code?: number; stdout?: string }
      return { exitCode: e.code ?? -1, stdout: e.stdout ?? '' }
    }
  }

  async function canAcquire(repo: string) {
    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(lockHelperPath, 'reset_worktree_lock_acquire "$1" && printf acquired', [repo]),
    )
    return stdout.trim() === 'acquired'
  }

  it('removes a stale reset-worktree lock and lets a fresh acquire succeed', async () => {
    const repo = await makeRepo()
    const home = await makeIsolatedHome()
    await mkdir(join(repo, '.local'), { recursive: true })
    await symlink('owner.999999.1', lockPath(repo))

    const result = await runUnstickLocks(repo, home)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Removed stale reset-worktree lock.')
    await expect(lstat(lockPath(repo))).rejects.toThrow('ENOENT')
    expect(await canAcquire(repo)).toBe(true)
  })

  it('leaves an active reset-worktree lock in place', async () => {
    const repo = await makeRepo()
    const home = await makeIsolatedHome()
    await mkdir(join(repo, '.local'), { recursive: true })
    // This test process is alive for the duration of the check, so its own pid reads as a live owner.
    await symlink(`owner.${process.pid}.1`, lockPath(repo))

    const result = await runUnstickLocks(repo, home)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('reset-worktree lock is active — not removed.')
    await expect(lstat(lockPath(repo))).resolves.toBeDefined()
  })

  it('reports no stale locks for a clean worktree', async () => {
    const repo = await makeRepo()
    const home = await makeIsolatedHome()

    const result = await runUnstickLocks(repo, home)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('No stale locks found.')
  })
})
