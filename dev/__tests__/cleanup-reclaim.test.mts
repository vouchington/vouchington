import { execFile, spawn } from 'node:child_process'
import {
  chmod,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readlink,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const devDir = fileURLToPath(new URL('..', import.meta.url))
const testDirs: string[] = []

async function makeRepo({ withCli, cliBody }: { withCli: boolean; cliBody?: string }) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-cleanup-reclaim-'))
  testDirs.push(dir)
  await execFileAsync('git', ['init', '-q'], { cwd: dir })
  await mkdir(join(dir, 'dev'), { recursive: true })
  await cp(join(devDir, 'cleanup'), join(dir, 'dev', 'cleanup'))
  await cp(join(devDir, 'lib'), join(dir, 'dev', 'lib'), { recursive: true })
  const bin = join(dir, 'bin')
  await mkdir(bin)
  for (const name of ['psql', 'dropdb', 'docker']) {
    await writeFile(join(bin, name), '#!/usr/bin/env bash\nexit 0\n')
    await chmod(join(bin, name), 0o755)
  }
  if (withCli) {
    await mkdir(join(dir, 'node_modules', '.bin'), { recursive: true })
    const cli = join(dir, 'node_modules', '.bin', 'vouchington')
    await writeFile(
      cli,
      cliBody ??
        '#!/usr/bin/env bash\nprintf "reclaim-args: %s\\n" "$*"\nif [ -L "$HOME/.voucha/worktree-resource-operations/lock" ]; then echo reclaim-lock: held; else echo reclaim-lock: free; fi\n',
    )
    await chmod(cli, 0o755)
  }
  return { dir, bin }
}

async function runCleanup(dir: string, bin: string, flags: string[]) {
  const { stdout } = await execFileAsync('bash', [join(dir, 'dev', 'cleanup'), ...flags], {
    cwd: dir,
    env: { ...process.env, HOME: dir, PATH: `${bin}:${process.env.PATH}` },
  })
  return stdout
}

describe('dev/cleanup worktree reclaim', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('is a dry run without --yes', async () => {
    const { dir, bin } = await makeRepo({ withCli: true })
    const out = await runCleanup(dir, bin, [])

    expect(out).toContain('reclaim-args: worktree reclaim\n')
  })

  it('passes --yes through and reclaims before the orphan scans', async () => {
    const { dir, bin } = await makeRepo({ withCli: true })
    const out = await runCleanup(dir, bin, ['--yes'])

    expect(out).toContain('reclaim-args: worktree reclaim --yes\n')
    expect(out.indexOf('reclaim-args')).toBeLessThan(out.indexOf('orphaned'))
  })

  it('skips reclaim with a warning when the tooling CLI is not installed', async () => {
    const { dir, bin } = await makeRepo({ withCli: false })
    const out = await runCleanup(dir, bin, ['--yes'])

    expect(out).toContain('Skipping worktree reclaim')
    expect(out).toContain('Cleanup complete')
  })

  it('reclaims under the operation lock and releases it afterwards', async () => {
    const { dir, bin } = await makeRepo({ withCli: true })
    const out = await runCleanup(dir, bin, ['--yes'])

    expect(out).toContain('reclaim-lock: held\n')
    await expect(
      lstat(join(dir, '.voucha', 'worktree-resource-operations', 'lock')),
    ).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not take the lock for a dry run', async () => {
    const { dir, bin } = await makeRepo({ withCli: true })
    const out = await runCleanup(dir, bin, [])

    expect(out).toContain('reclaim-lock: free\n')
  })

  describe('with another operation holding the lock', () => {
    async function holdLock(dir: string) {
      const lockRoot = join(dir, '.voucha', 'worktree-resource-operations')
      const token = `owner.${process.pid}.1`
      await mkdir(lockRoot, { recursive: true })
      await writeFile(join(lockRoot, token), `${process.pid}\n`)
      await symlink(token, join(lockRoot, 'lock'))
      return { lock: join(lockRoot, 'lock'), token }
    }

    it('skips reclaim and leaves the holder untouched', async () => {
      const { dir, bin } = await makeRepo({ withCli: true })
      const { lock, token } = await holdLock(dir)
      const out = await runCleanup(dir, bin, ['--yes'])

      expect(out).toContain('Skipping worktree reclaim: another worktree resource operation')
      expect(out).not.toContain('reclaim-args')
      await expect(readlink(lock)).resolves.toBe(token)
    })

    it('exits quietly without reclaiming when run with --background', async () => {
      const { dir, bin } = await makeRepo({ withCli: true })
      const { lock, token } = await holdLock(dir)
      const out = await runCleanup(dir, bin, ['--yes', '--background'])

      expect(out).not.toContain('reclaim-args')
      expect(out).not.toContain('Cleanup complete')
      await expect(readlink(lock)).resolves.toBe(token)
    })
  })

  it('makes ./dev/initialize wait for a running background cleanup instead of failing', async () => {
    // The fake reclaim CLI announces itself on fd 3, then blocks reading stdin until the test
    // closes it, so the cleanup holds the lock exactly as long as the test decides.
    const { dir, bin } = await makeRepo({
      withCli: true,
      cliBody: '#!/usr/bin/env bash\necho started >&3\ncat >/dev/null\n',
    })
    const env = { ...process.env, HOME: dir, PATH: `${bin}:${process.env.PATH}` }
    const cleanup = spawn('bash', [join(dir, 'dev', 'cleanup'), '--yes', '--background'], {
      cwd: dir,
      env,
      stdio: ['pipe', 'ignore', 'ignore', 'pipe'],
    })
    for await (const chunk of cleanup.stdio[3] as NodeJS.ReadableStream) {
      if (String(chunk).includes('started')) break
    }

    const waiter = spawn(
      'bash',
      [
        '-c',
        `source "$1/dev/lib/worktree-resource-env.sh"
eval "orig_$(declare -f worktree_resource_wait_background_cleanup)"
worktree_resource_wait_background_cleanup() { echo waiting >&2; orig_worktree_resource_wait_background_cleanup "$@"; }
worktree_resource_acquire_operation_lock_after_background && echo acquired`,
        'waiter',
        dir,
      ],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stdout = ''
    waiter.stdout.on('data', chunk => (stdout += String(chunk)))
    for await (const chunk of waiter.stderr) if (String(chunk).includes('waiting')) break

    cleanup.stdin?.end()
    const code = await new Promise(resolve => waiter.on('close', resolve))

    expect(code).toBe(0)
    expect(stdout).toBe('acquired\n')
  })
})
