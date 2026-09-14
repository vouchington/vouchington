import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { access, chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const teardownPath = fileURLToPath(new URL('../teardown', import.meta.url))
const refuseOnMainPath = fileURLToPath(new URL('../lib/refuse-on-main.sh', import.meta.url))
const dbNameFromUrlPath = fileURLToPath(new URL('../lib/db-name-from-url.sh', import.meta.url))
const dbTargetPath = fileURLToPath(new URL('../lib/db-target.sh', import.meta.url))
const gitWorktreesPath = fileURLToPath(
  new URL(
    '../../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh',
    import.meta.url,
  ),
)
const worktreeResourceEnvPath = fileURLToPath(
  new URL('../lib/worktree-resource-env.sh', import.meta.url),
)
const testDirs: string[] = []

async function makeRepo(databaseUrl: string, worktreeDir?: string) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-teardown-'))
  testDirs.push(dir)
  const effectiveWorktreeDir =
    worktreeDir ??
    `d${createHash('sha256')
      .update(await realpath(dir))
      .digest('hex')
      .slice(0, 12)}`
  await mkdir(join(dir, 'dev', 'lib'), { recursive: true })
  await writeFile(join(dir, 'dev', 'teardown'), await readFile(teardownPath, 'utf8'))
  await chmod(join(dir, 'dev', 'teardown'), 0o755)
  await writeFile(
    join(dir, 'dev', 'lib', 'refuse-on-main.sh'),
    await readFile(refuseOnMainPath, 'utf8'),
  )
  await writeFile(
    join(dir, 'dev', 'lib', 'db-name-from-url.sh'),
    await readFile(dbNameFromUrlPath, 'utf8'),
  )
  await writeFile(join(dir, 'dev', 'lib', 'db-target.sh'), await readFile(dbTargetPath, 'utf8'))
  await writeFile(
    join(dir, 'dev', 'lib', 'git-worktrees.sh'),
    await readFile(gitWorktreesPath, 'utf8'),
  )
  await writeFile(
    join(dir, 'dev', 'lib', 'worktree-resource-env.sh'),
    await readFile(worktreeResourceEnvPath, 'utf8'),
  )
  await writeFile(
    join(dir, 'dev', 'stop-services'),
    `#!/usr/bin/env bash
printf 'stop-services %s\n' "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
  )
  await chmod(join(dir, 'dev', 'stop-services'), 0o755)
  await writeFile(join(dir, '.git'), 'gitdir: /fake/.git/worktrees/test\n')
  await writeFile(join(dir, '.valkey-port'), '6379\n')
  await writeFile(
    join(dir, '.env'),
    `export DATABASE_URL=${databaseUrl}
export VALKEY_CONTAINER=voucha-valkey-${effectiveWorktreeDir}
export WORKTREE_DIR=${effectiveWorktreeDir}
`,
  )
  return dir
}

async function makeFakeBin() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-teardown-bin-'))
  testDirs.push(dir)
  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
if [ "$1" = "worktree" ] && [ "$2" = "list" ] && [ "$3" = "--porcelain" ]; then
  printf 'worktree %s\nbranch refs/heads/main\n\n' "$(dirname "$(dirname "$0")")"
  exit 0
fi
if [ "$1" = "-C" ] && [ "$3" = "rev-parse" ] && [ "$4" = "--show-toplevel" ]; then
  printf '%s' "$2"
  exit 0
fi
printf 'unexpected git invocation: %s\n' "$*" >&2
exit 1
`,
  )
  await chmod(join(dir, 'git'), 0o755)
  await writeFile(
    join(dir, 'dropdb'),
    `#!/usr/bin/env bash
printf 'dropdb env PGHOST=%s PGPORT=%s args=%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
  )
  await chmod(join(dir, 'dropdb'), 0o755)
  await writeFile(join(dir, 'sleep'), '#!/usr/bin/env bash\nexit 0\n')
  await chmod(join(dir, 'sleep'), 0o755)
  return dir
}

async function runTeardown(cwd: string, binDir: string, env: Record<string, string> = {}) {
  const logPath = join(cwd, 'commands.log')
  await execFileAsync('bash', [join(cwd, 'dev', 'teardown'), '--yes'], {
    cwd,
    env: {
      ...process.env,
      ...env,
      FAKE_COMMAND_LOG: logPath,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  })
  return readFile(logPath, 'utf8')
}

describe('dev/teardown database host handling', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses the DATABASE_URL host and port when dropping the database', async () => {
    const cwd = await makeRepo('postgres://localhost:15432/voucha-test')
    const log = await runTeardown(cwd, await makeFakeBin())

    expect(log).toContain('dropdb env PGHOST=localhost PGPORT=15432 args=voucha-test')
  })

  it('uses DATABASE_URL host and port before explicit PGHOST or PGPORT', async () => {
    const cwd = await makeRepo('postgres://localhost:15432/voucha-test')
    const log = await runTeardown(cwd, await makeFakeBin(), {
      PGHOST: 'socket-host',
      PGPORT: '6543',
      VOUCHA_ALLOW_NON_LOCAL_DB_TEARDOWN: '1',
    })

    expect(log).toContain('dropdb env PGHOST=localhost PGPORT=15432 args=voucha-test')
  })

  it('refuses non-local teardown without explicit opt-in', async () => {
    const cwd = await makeRepo('postgres://dbhost:15432/voucha-test')

    await expect(runTeardown(cwd, await makeFakeBin())).rejects.toMatchObject({ code: 1 })
  })

  it('refuses teardown when .env belongs to another worktree', async () => {
    const cwd = await makeRepo('postgres://localhost:15432/voucha-other', 'other-worktree')

    await expect(runTeardown(cwd, await makeFakeBin())).rejects.toMatchObject({ code: 1 })
  })

  it('allows non-local teardown with explicit opt-in', async () => {
    const cwd = await makeRepo('postgres://dbhost:15432/voucha-test')
    const log = await runTeardown(cwd, await makeFakeBin(), {
      VOUCHA_ALLOW_NON_LOCAL_DB_TEARDOWN: '1',
    })

    expect(log).toContain('dropdb env PGHOST=dbhost PGPORT=15432 args=voucha-test')
  })

  it('removes a disposable full clone directory with --remove', async () => {
    const cwd = await makeRepo('postgres://localhost:15432/voucha-clone')
    await rm(join(cwd, '.git'))
    await mkdir(join(cwd, '.git'))
    const identity = (
      await execFileAsync('bash', [
        '-c',
        `source "$1"; worktree_resource_current_dir "$2"`,
        'identity',
        worktreeResourceEnvPath,
        cwd,
      ])
    ).stdout.trim()
    await writeFile(
      join(cwd, '.env'),
      `export DATABASE_URL=postgres://localhost:15432/voucha-clone
export VALKEY_CONTAINER=voucha-valkey-${identity}
export WORKTREE_DIR=${identity}
`,
    )
    const binDir = await makeFakeBin()
    await writeFile(join(binDir, 'docker'), '#!/usr/bin/env bash\nexit 0\n')
    await chmod(join(binDir, 'docker'), 0o755)
    await execFileAsync('bash', [join(cwd, 'dev', 'teardown'), '--yes', '--remove'], {
      cwd,
      env: {
        ...process.env,
        FAKE_COMMAND_LOG: join(cwd, 'commands.log'),
        PATH: `${binDir}:${process.env.PATH}`,
        HOME: dirname(cwd),
      },
    })
    await expect(access(cwd)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
