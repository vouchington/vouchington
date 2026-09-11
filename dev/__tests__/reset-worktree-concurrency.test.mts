import { execFile } from 'node:child_process'
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

describe('reset-worktree lock (#10849)', () => {
  const execFileAsync = promisify(execFile)
  const devDir = fileURLToPath(new URL('..', import.meta.url))
  const testDirs: string[] = []

  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  async function writeExecutable(path: string, content: string) {
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, content)
    await chmod(path, 0o755)
  }

  // Minimal fixture: reset-worktree's teardown gate reports "never initialized" and
  // skips it when there is no .env, so this repo needs no docker/dropdb fakes -- only
  // the git/openssl commands reset-worktree itself invokes on the way to a clean exit.
  async function makeRepo() {
    const repo = await mkdtemp(join(tmpdir(), 'voucha-reset-concurrency-'))
    testDirs.push(repo)
    await mkdir(join(repo, 'dev', 'lib'), { recursive: true })
    await writeFile(join(repo, '.git'), 'gitdir: /fake/.git/worktrees/test\n')

    for (const relativePath of [
      'reset-worktree',
      'lib/refuse-on-main.sh',
      'lib/worktree-resource-env.sh',
      'lib/db-name-from-url.sh',
      'lib/reset-worktree-lock.sh',
      'lib/git-index-lock.sh',
    ]) {
      const destination = join(repo, 'dev', relativePath)
      await mkdir(join(destination, '..'), { recursive: true })
      await writeFile(destination, await readFile(join(devDir, relativePath), 'utf8'))
      if (!relativePath.startsWith('lib/')) await chmod(destination, 0o755)
    }
    // No-op: this test only cares about the reset-worktree lock, not tmux window state.
    await writeExecutable(join(repo, 'dev', 'tmux-name'), '#!/usr/bin/env bash\n:\n')

    await writeExecutable(
      join(repo, 'dev', 'initialize'),
      `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
lockLog="\${FAKE_LOCK_LOG:?}"
printf 'initialize %s\\n' "$*" >> "$log"
printf 'initialize:%s\\n' "$(readlink "$(pwd)/.local/reset-worktree.lock" 2>/dev/null || echo MISSING)" >> "$lockLog"
`,
    )
    return repo
  }

  async function makeFakeBin() {
    const binDir = await mkdtemp(join(tmpdir(), 'voucha-reset-concurrency-bin-'))
    testDirs.push(binDir)
    await writeExecutable(
      join(binDir, 'git'),
      `#!/usr/bin/env bash
log="\${FAKE_COMMAND_LOG:?}"
lockLog="\${FAKE_LOCK_LOG:?}"
if [ "$1" = "-C" ]; then repo="$2"; shift 2; fi
case "$*" in
  "rev-parse --show-toplevel") printf '%s' "\${repo:-$(pwd)}" ;;
  "diff-index --quiet HEAD --") printf 'git diff-index\\n' >> "$log" ;;
  "status --porcelain --untracked-files=normal") printf 'git status\\n' >> "$log" ;;
  "fetch origin main")
    printf 'git fetch origin main\\n' >> "$log"
    printf 'fetch:%s\\n' "$(readlink "\${repo:-$(pwd)}/.local/reset-worktree.lock" 2>/dev/null || echo MISSING)" >> "$lockLog"
    ;;
  "checkout -B "*)
    printf 'git %s\\n' "$*" >> "$log"
    printf 'checkout:%s\\n' "$(readlink "\${repo:-$(pwd)}/.local/reset-worktree.lock" 2>/dev/null || echo MISSING)" >> "$lockLog"
    ;;
  "reset --hard origin/main") printf 'git reset --hard origin/main\\n' >> "$log" ;;
  "clean -fd") printf 'git clean -fd\\n' >> "$log" ;;
  *) printf 'unexpected git invocation: %s\\n' "$*" >&2; exit 1 ;;
esac
`,
    )
    await writeExecutable(
      join(binDir, 'openssl'),
      '#!/usr/bin/env bash\nif [ "$1" = rand ]; then printf "cafef00d\\n"; fi\n',
    )
    return binDir
  }

  function readLockPath(repo: string) {
    return join(repo, '.local', 'reset-worktree.lock')
  }

  async function run(repo: string, binDir: string) {
    const commandLog = join(repo, 'commands.log')
    const lockLog = join(repo, 'lock.log')
    try {
      const result = await execFileAsync('bash', [join(repo, 'dev', 'reset-worktree')], {
        cwd: repo,
        env: {
          ...process.env,
          FAKE_COMMAND_LOG: commandLog,
          FAKE_LOCK_LOG: lockLog,
          PATH: `${binDir}:/usr/bin:/bin`,
        },
      })
      return { commandLog, exitCode: 0, lockLog, stderr: result.stderr, stdout: result.stdout }
    } catch (err: unknown) {
      const e = err as { code?: number; stderr?: string; stdout?: string }
      return {
        commandLog,
        exitCode: e.code ?? -1,
        lockLog,
        stderr: (e.stderr ?? '').trim(),
        stdout: (e.stdout ?? '').trim(),
      }
    }
  }

  async function readOrEmpty(path: string) {
    try {
      return await readFile(path, 'utf8')
    } catch {
      return ''
    }
  }

  it('refuses to run when the lock is already held, without invoking any lifecycle commands', async () => {
    const repo = await makeRepo()
    const binDir = await makeFakeBin()
    await mkdir(join(repo, '.local'), { recursive: true })
    await symlink('owner.1.1', readLockPath(repo))

    const result = await run(repo, binDir)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('another ./dev/reset-worktree is already running')
    expect(result.stderr).toContain(readLockPath(repo))
    expect(result.stderr).toContain('./dev/unstick-locks')
    expect(await readOrEmpty(result.commandLog)).toBe('')
    expect(await readOrEmpty(result.lockLog)).toBe('')
    // The refused run never held the lock, so it must never touch the winner's.
    await expect(lstat(readLockPath(repo))).resolves.toBeDefined()
  })

  it('holds one lock across the fetch, branch-creation, and initialize boundaries', async () => {
    const repo = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await run(repo, binDir)

    expect(result.exitCode).toBe(0)
    const lockLog = await readOrEmpty(result.lockLog)
    const boundaries = Object.fromEntries(
      lockLog
        .trim()
        .split('\n')
        .map(line => line.split(':') as [string, string]),
    )
    expect(Object.keys(boundaries).sort()).toEqual(['checkout', 'fetch', 'initialize'])
    const tokens = new Set(Object.values(boundaries))
    expect(tokens.size).toBe(1)
    expect([...tokens][0]).not.toBe('MISSING')
    expect([...tokens][0]).toMatch(/^owner\.\d+\.\d+$/)

    // Released via the EXIT trap once the script finishes.
    await expect(lstat(readLockPath(repo))).rejects.toThrow('ENOENT')
  })

  it('creates no lock for --help', async () => {
    const repo = await makeRepo()
    const binDir = await makeFakeBin()

    const result = await execFileAsync('bash', [join(repo, 'dev', 'reset-worktree'), '--help'], {
      cwd: repo,
      env: {
        ...process.env,
        FAKE_COMMAND_LOG: join(repo, 'commands.log'),
        FAKE_LOCK_LOG: join(repo, 'lock.log'),
        PATH: `${binDir}:/usr/bin:/bin`,
      },
    })

    expect(result.stdout).toContain('Usage: ./dev/reset-worktree')
    await expect(lstat(readLockPath(repo))).rejects.toThrow('ENOENT')
  })
})
