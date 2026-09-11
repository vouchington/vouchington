import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const dbCleanPath = fileURLToPath(new URL('../db-clean', import.meta.url))
const refuseOnMainPath = fileURLToPath(new URL('../lib/refuse-on-main.sh', import.meta.url))
const dbNameFromUrlPath = fileURLToPath(new URL('../lib/db-name-from-url.sh', import.meta.url))
const dbTargetPath = fileURLToPath(new URL('../lib/db-target.sh', import.meta.url))
const flushValkeyPath = fileURLToPath(new URL('../lib/flush-valkey.sh', import.meta.url))
const worktreeResourceEnvPath = fileURLToPath(
  new URL('../lib/worktree-resource-env.sh', import.meta.url),
)
const testDirs: string[] = []

async function makeRepo(databaseUrl: string) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-db-clean-safety-'))
  testDirs.push(dir)
  await mkdir(join(dir, 'dev', 'lib'), { recursive: true })
  await writeFile(join(dir, 'dev', 'db-clean'), await readFile(dbCleanPath, 'utf8'))
  await chmod(join(dir, 'dev', 'db-clean'), 0o755)
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
    join(dir, 'dev', 'lib', 'flush-valkey.sh'),
    await readFile(flushValkeyPath, 'utf8'),
  )
  await writeFile(
    join(dir, 'dev', 'lib', 'worktree-resource-env.sh'),
    await readFile(worktreeResourceEnvPath, 'utf8'),
  )
  await writeFile(join(dir, '.git'), 'gitdir: /fake/.git/worktrees/test\n')
  const worktreeDir = `d${createHash('sha256')
    .update(await realpath(dir))
    .digest('hex')
    .slice(0, 12)}`
  await writeFile(
    join(dir, '.env'),
    `export DATABASE_URL='${databaseUrl}'\nexport WORKTREE_DIR='${worktreeDir}'\n`,
  )
  return dir
}

async function makeFakeBin() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-db-clean-safety-bin-'))
  testDirs.push(dir)
  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
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
printf 'dropdb env PGHOST=%s args=%s\n' "\${PGHOST:-}" "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
  )
  await chmod(join(dir, 'dropdb'), 0o755)
  await writeFile(
    join(dir, 'createdb'),
    `#!/usr/bin/env bash
printf 'createdb env PGHOST=%s args=%s\n' "\${PGHOST:-}" "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
  )
  await chmod(join(dir, 'createdb'), 0o755)
  return dir
}

async function runDbClean(cwd: string, binDir: string, env: Record<string, string> = {}) {
  const logPath = join(cwd, 'commands.log')
  const run = execFileAsync('bash', [join(cwd, 'dev', 'db-clean'), '--db-only'], {
    cwd,
    env: {
      ...process.env,
      ...env,
      FAKE_COMMAND_LOG: logPath,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  })
  return { logPath, run }
}

describe('dev/db-clean non-local safety', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('refuses hostnames that only look like numeric loopback addresses', async () => {
    const cwd = await makeRepo('postgres://127.shared.example.com/voucha-test')
    const { logPath, run } = await runDbClean(cwd, await makeFakeBin())

    await expect(run).rejects.toMatchObject({ code: 1 })
    await expect(readFile(logPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses empty hostaddr entries that fall back to remote hosts', async () => {
    const cwd = await makeRepo('postgres://db1,db2/voucha-test?hostaddr=,')
    const { logPath, run } = await runDbClean(cwd, await makeFakeBin())

    await expect(run).rejects.toMatchObject({ code: 1 })
    await expect(readFile(logPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('allows non-local db-clean only with explicit opt-in', async () => {
    const cwd = await makeRepo('postgres://dbhost/voucha-test')
    const { logPath, run } = await runDbClean(cwd, await makeFakeBin(), {
      VOUCHA_ALLOW_NON_LOCAL_DB_CLEAN: '1',
    })

    await run
    const log = await readFile(logPath, 'utf8')
    expect(log).toContain('dropdb env PGHOST=dbhost args=--if-exists -- voucha-test')
    expect(log).toContain('createdb env PGHOST=dbhost args=-- voucha-test')
  })
})
