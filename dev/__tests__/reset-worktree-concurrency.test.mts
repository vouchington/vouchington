import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { lstat, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupResetWorktreeTestDirs,
  expectResetSuccess,
  makeFakeBin,
  makeRepo,
  runResetWorktree,
} from '../test-helpers/reset-worktree.mts'

describe('reset-worktree concurrency (#10849)', () => {
  afterEach(cleanupResetWorktreeTestDirs)

  it('refuses a second reset while the same worktree is locked, then succeeds after release', async () => {
    const cwd = await makeRepo({ withEnv: false })
    const binDir = await makeFakeBin()
    const lockPath = join(cwd, '.local', 'reset-worktree.lock')
    const holder = spawn(
      'bash',
      [
        '-c',
        'mkdir -p "$(dirname "$1")"; if command -v flock >/dev/null; then exec 9>>"$1"; flock -n 9; echo ready; read -r _; else lockf -s -k -t 0 "$1" bash -c "echo ready; read -r _"; fi',
        'holder',
        lockPath,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    )

    try {
      expect((await once(holder.stdout!, 'data'))[0].toString()).toContain('ready')
      const refused = await runResetWorktree({ binDir, cwd })
      expect(refused.exitCode).toBe(1)
      expect(refused.stderr).toContain('another ./dev/reset-worktree is running')
      expect(refused.log).toBe('')
    } finally {
      holder.stdin?.end('\n')
      await once(holder, 'exit')
    }

    const completed = await runResetWorktree({ binDir, cwd })
    expectResetSuccess(completed)
    expect((await lstat(lockPath)).isFile()).toBe(true)
  })

  it('keeps the help path free of lock-file side effects', async () => {
    const cwd = await makeRepo({ withEnv: false })
    const binDir = await makeFakeBin()
    const result = await runResetWorktree({ binDir, cwd, args: ['--help'] })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Usage: ./dev/reset-worktree')
    await expect(lstat(join(cwd, '.local', 'reset-worktree.lock'))).rejects.toThrow('ENOENT')
  })

  it('can reset offline when the published helper is missing', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    await rm(join(cwd, 'node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh'))

    const result = await runResetWorktree({ binDir, cwd })
    expectResetSuccess(result)
    expect(result.log).toContain('fetch origin main')
    expect(result.log).toContain('dropdb voucha-test')
    expect(result.log).toContain('initialize monorepo')
  })
})
