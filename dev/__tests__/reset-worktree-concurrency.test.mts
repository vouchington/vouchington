import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFileSync, watch } from 'node:fs'
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

function readWhenNonEmpty(directory: string, filename: string): Promise<string> {
  const file = join(directory, filename)
  const read = (): string | undefined => {
    try {
      const contents = readFileSync(file, 'utf8')
      return contents === '' ? undefined : contents
    } catch {
      return undefined
    }
  }
  return new Promise((resolve, reject) => {
    let settled = false
    let watcher!: ReturnType<typeof watch>
    const timeout = AbortSignal.timeout(5_000)
    const onTimeout = () => {
      if (settled) return
      settled = true
      watcher.close()
      reject(new Error(`Timed out waiting for ${filename}`))
    }
    const finish = (contents: string) => {
      if (settled) return
      settled = true
      timeout.removeEventListener('abort', onTimeout)
      watcher.close()
      resolve(contents)
    }
    watcher = watch(directory, (_event, name) => {
      if (name && name !== filename) return
      const contents = read()
      if (contents === undefined) return
      finish(contents)
    })
    watcher.on('error', err => {
      if (settled) return
      settled = true
      timeout.removeEventListener('abort', onTimeout)
      watcher.close()
      reject(err)
    })
    timeout.addEventListener('abort', onTimeout, { once: true })
    const existing = read()
    if (existing !== undefined) finish(existing)
  })
}

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
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      const exited = once(reset, 'exit')
      const descendantsExited = once(reset.stdout!, 'end')
      reset.stdout!.resume()
      try {
        await readWhenNonEmpty(cwd, 'database-child.pid')
        reset.kill('SIGTERM')
        expect((await exited)[0]).toBe(143)
        await descendantsExited
        await writeFile(join(binDir, 'dropdb'), '#!/usr/bin/env bash\nexit 0\n')
        expectResetSuccess(await runResetWorktree({ binDir, cwd }))
      } finally {
        reset.kill('SIGKILL')
        const pid = Number(await readFile(childFile, 'utf8').catch(() => ''))
        if (pid) await execFileAsync('kill', ['-KILL', String(pid)]).catch(() => undefined)
      }
    },
  )

  it('allows TERM cleanup before forcibly stopping remaining children', async () => {
    const cwd = await makeRepo()
    const binDir = await makeFakeBin()
    const lockFile = join(cwd, 'git-index.lock')
    await writeFile(
      join(binDir, 'dropdb'),
      `#!/usr/bin/env bash
trap '/bin/sleep 0.1; rm -f "$GIT_INDEX_LOCK"; exit 0' TERM
printf 'active git write' > "$GIT_INDEX_LOCK"
/bin/sleep 60 &
wait
`,
    )
    const reset = spawn('bash', [join(cwd, 'dev', 'reset-worktree')], {
      cwd,
      env: {
        ...process.env,
        PATH: `${binDir}:/usr/bin:/bin`,
        FAKE_COMMAND_LOG: join(cwd, 'commands.log'),
        GIT_INDEX_LOCK: lockFile,
      },
      stdio: 'ignore',
    })
    const exited = once(reset, 'exit')
    try {
      await readWhenNonEmpty(cwd, 'git-index.lock')
      reset.kill('SIGTERM')
      expect((await exited)[0]).toBe(143)
      await expect(lstat(lockFile)).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      reset.kill('SIGTERM')
    }
  })

  it('fails terminal reads instead of suspending a background reset worker', async () => {
    const cwd = await makeRepo({ withEnv: false })
    const binDir = await makeFakeBin()
    const gitPath = join(binDir, 'git')
    const gitScript = await readFile(gitPath, 'utf8')
    await writeFile(
      gitPath,
      gitScript.replace(
        "    printf 'git fetch origin main",
        `    read -r terminal_input </dev/tty || exit 1
    printf 'git fetch origin main`,
      ),
    )
    // A real controlling terminal reproduces SIGTTIN; pipes cannot.
    const result = await execFileAsync(
      'python3',
      [
        '-c',
        `
import os, pty, select, signal, sys, time
pid, fd = pty.fork()
if pid == 0:
    os.execvp('bash', ['bash', sys.argv[1]])
output = b''
deadline = time.monotonic() + 5
while time.monotonic() < deadline:
    if select.select([fd], [], [], 0.05)[0]:
        try:
            output += os.read(fd, 65536)
        except OSError:
            pass
    child, status = os.waitpid(pid, os.WNOHANG)
    if child:
        print(os.waitstatus_to_exitcode(status))
        print(output.decode(errors='replace'))
        sys.exit(0)
os.kill(pid, signal.SIGTERM)
os.waitpid(pid, 0)
raise RuntimeError('reset worker suspended on terminal input')
`,
        join(cwd, 'dev', 'reset-worktree'),
      ],
      {
        cwd,
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH}`,
          FAKE_COMMAND_LOG: join(cwd, 'commands.log'),
        },
      },
    )
    expect(result.stdout.split('\n')[0]).toBe('1')
    expect(result.stdout).toContain('Input/output error')
    expect(await readFile(join(cwd, 'commands.log'), 'utf8')).not.toContain('checkout -B')
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
