import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { chmod, lstat, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import {
  cleanupResetWorktreeTestDirs,
  expectResetSuccess,
  makeFakeBin,
  makeRepo,
  runResetWorktree,
} from '../test-helpers/reset-worktree.mts'

const execFileAsync = promisify(execFile)

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

  it.each(['flock', 'lockf'])(
    'cancels %s teardown descendants and allows a reset retry',
    async lock => {
      const cwd = await makeRepo()
      const binDir = await makeFakeBin()
      const childFile = join(cwd, 'database-child.pid')
      const bashEnv = join(cwd, 'bash-env')
      if (lock === 'lockf' && process.platform === 'linux') {
        // Exercise macOS wrapper supervision using a Linux lock owner with
        // the same lockf argv contract and inherited lock behavior.
        await writeFile(
          bashEnv,
          `command() {
  if [ "$1" = -v ] && [ "$2" = flock ]; then return 1; fi
  builtin command "$@"
}
`,
        )
        await writeFile(
          join(binDir, 'lockf'),
          '#!/usr/bin/env bash\nexec /usr/bin/flock -n "$5" "${@:6}"\n',
        )
        await chmod(join(binDir, 'lockf'), 0o755)
      }

      await writeFile(
        join(binDir, 'dropdb'),
        `#!/usr/bin/env bash
trap '' TERM
/bin/sleep 60 &
echo "$!" > "$DATABASE_CHILD_FILE"
wait
`,
      )
      const reset = spawn('bash', [join(cwd, 'dev', 'reset-worktree')], {
        cwd,
        env: {
          ...process.env,
          PATH: `${binDir}:/usr/bin:/bin`,
          FAKE_COMMAND_LOG: join(cwd, 'commands.log'),
          DATABASE_CHILD_FILE: childFile,
          BASH_ENV: bashEnv,
        },
        stdio: 'ignore',
      })
      const exited = once(reset, 'exit')
      try {
        await expect.poll(async () => readFile(childFile, 'utf8').catch(() => '')).not.toBe('')
        const pid = Number(await readFile(childFile, 'utf8'))
        reset.kill('SIGTERM')
        expect((await exited)[0]).toBe(143)
        await expect
          .poll(async () => {
            try {
              await execFileAsync('kill', ['-0', String(pid)])
              return false
            } catch {
              return true
            }
          })
          .toBe(true)
        await writeFile(join(binDir, 'dropdb'), '#!/usr/bin/env bash\nexit 0\n')
        expectResetSuccess(await runResetWorktree({ binDir, cwd }))
      } finally {
        reset.kill('SIGKILL')
        const pid = Number(await readFile(childFile, 'utf8').catch(() => ''))
        if (pid) await execFileAsync('kill', ['-KILL', String(pid)]).catch(() => undefined)
      }
    },
  )

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
