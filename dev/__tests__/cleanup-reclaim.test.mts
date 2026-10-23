import { execFile } from 'node:child_process'
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

async function makeRepo({ withCli }: { withCli: boolean }) {
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
      '#!/usr/bin/env bash\nprintf "reclaim-args: %s\\n" "$*"\nif [ -L "$HOME/.voucha/worktree-resource-operations/lock" ]; then echo reclaim-lock: held; else echo reclaim-lock: free; fi\n',
    )
    await chmod(cli, 0o755)
  }
  return { dir, bin }
}

async function runCleanup(dir: string, bin: string, flags: string[]) {
  const { stderr, stdout } = await execFileAsync('bash', [join(dir, 'dev', 'cleanup'), ...flags], {
    cwd: dir,
    env: { ...process.env, HOME: dir, PATH: `${bin}:${process.env.PATH}` },
  })
  return stdout + stderr
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

  it('forwards bounded scan options and preserves cursor whitespace under the operation lock', async () => {
    const { dir, bin } = await makeRepo({ withCli: true })
    const cli = join(dir, 'node_modules', '.bin', 'vouchington')
    await writeFile(
      cli,
      `#!/usr/bin/env bash
printf 'arg=<%s>\\n' "$@"
if [ -L "$HOME/.voucha/worktree-resource-operations/lock" ]; then echo reclaim-lock: held; fi
printf "Scan incomplete; resume with --after '/tmp/next path'\\n"
`,
    )
    const out = await runCleanup(dir, bin, [
      '--yes',
      '--max-worktrees',
      '3',
      '--timeout-ms',
      '2000',
      '--pr-limit',
      '200',
      '--after',
      '/tmp/previous path',
    ])
    expect(out).toContain('arg=<--after>\narg=</tmp/previous path>\n')
    expect(out).toContain('arg=<--max-worktrees>\narg=<3>\n')
    expect(out).toContain('arg=<--timeout-ms>\narg=<2000>\n')
    expect(out).toContain('arg=<--pr-limit>\narg=<200>\n')
    expect(out).toContain('arg=<--yes>\n')
    expect(out).toContain('reclaim-lock: held\n')
    expect(out).toContain(
      "resume with ./dev/cleanup --max-worktrees 3 --timeout-ms 2000 --pr-limit 200 --yes --after '/tmp/next path'",
    )
  })

  it.each([
    ['--after'],
    ['--after', '--yes'],
    ['--max-worktrees', '0'],
    ['--timeout-ms', '1.5'],
    ['--yes', '--pr-limit', '10001'],
    ['--pr-limit', '9007199254740992'],
    ['--after', '/a', '--after', '/b'],
    ['--yes', '-y'],
  ])('rejects invalid flags before invoking reclaim: %j', async (...flags) => {
    const { dir, bin } = await makeRepo({ withCli: true })
    await expect(runCleanup(dir, bin, flags)).rejects.toMatchObject({
      code: 2,
      stdout: expect.not.stringContaining('reclaim-args:'),
    })
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

      expect(out).toContain('Skipping worktree reclaim: the worktree resource operation lock')
      expect(out).toContain('another worktree resource operation is running')
      expect(out).not.toContain('reclaim-args')
      await expect(readlink(lock)).resolves.toBe(token)
    })
  })
})
