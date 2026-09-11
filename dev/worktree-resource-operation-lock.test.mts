import { execFile } from 'node:child_process'
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { sourceBashArgs } from './test-helpers/initialize.mts'

describe('worktree resource operation lock', () => {
  const execFileAsync = promisify(execFile)
  const helperPath = fileURLToPath(new URL('./lib/worktree-resource-env.sh', import.meta.url))
  const cleanupPath = fileURLToPath(new URL('./cleanup', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function makeHome() {
    const home = await mkdtemp(join(tmpdir(), 'voucha-resource-lock-'))
    testDirs.push(home)
    return home
  }

  it('excludes another operation until the owner releases the lock', async () => {
    const home = await makeHome()
    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        worktree_resource_acquire_operation_lock
        if (unset WORKTREE_RESOURCE_OPERATION_LOCK_TOKEN; worktree_resource_acquire_operation_lock) 2>/dev/null; then
          printf concurrent
        else
          printf blocked
        fi
        worktree_resource_release_operation_lock
        worktree_resource_acquire_operation_lock
        printf ':reacquired'
        worktree_resource_release_operation_lock
        `,
      ),
      { env: { ...process.env, HOME: home } },
    )

    expect(stdout.trim()).toBe('blocked:reacquired')
  })

  it('fails closed until unstick-locks clears a dead owner', async () => {
    const home = await makeHome()
    const lockRoot = join(home, '.voucha', 'worktree-resource-operations')
    const staleToken = 'owner.999999.1'
    await mkdir(lockRoot, { recursive: true })
    await writeFile(join(lockRoot, staleToken), '999999\n')
    await symlink(staleToken, join(lockRoot, 'lock'))
    await mkdir(join(lockRoot, `reclaim.${staleToken}`))

    const { stdout } = await execFileAsync(
      'bash',
      sourceBashArgs(
        helperPath,
        `
        if worktree_resource_acquire_operation_lock 2>/dev/null; then printf unsafe; else printf blocked; fi
        worktree_resource_clear_stale_operation_lock
        worktree_resource_acquire_operation_lock
        printf ':acquired'
        worktree_resource_release_operation_lock
        `,
      ),
      { env: { ...process.env, HOME: home } },
    )

    expect(stdout.trim()).toBe('blocked:acquired')
  })

  it('fails closed when a corrupt lock symlink targets a directory', async () => {
    const home = await makeHome()
    const lockRoot = join(home, '.voucha', 'worktree-resource-operations')
    const corruptTarget = 'owner.999999.1'
    await mkdir(join(lockRoot, corruptTarget), { recursive: true })
    await symlink(corruptTarget, join(lockRoot, 'lock'))

    await expect(
      execFileAsync(
        'bash',
        sourceBashArgs(helperPath, 'worktree_resource_acquire_operation_lock'),
        {
          env: { ...process.env, HOME: home },
        },
      ),
    ).rejects.toMatchObject({ code: 1 })
    await expect(lstat(join(lockRoot, corruptTarget))).resolves.toBeDefined()
  })

  it('deletes only confirmed names that remain orphaned after the locked rescan', async () => {
    const cleanup = await readFile(cleanupPath, 'utf8')
    expect(cleanup).toContain('CONFIRMED_DBS=("${ORPHANED_DBS[@]}")')
    expect(cleanup).toContain('resource_name_is_still_orphaned "$db" "${ORPHANED_DBS[@]}"')
    expect(cleanup).toContain('CONFIRMED_CONTAINERS=("${ORPHANED_CONTAINERS[@]}")')
    expect(cleanup).toContain(
      'resource_name_is_still_orphaned "$container" "${ORPHANED_CONTAINERS[@]}"',
    )
  })
})
