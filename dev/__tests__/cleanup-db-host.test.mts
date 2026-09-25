import { execFile } from 'node:child_process'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const cleanupPath = fileURLToPath(new URL('../cleanup', import.meta.url))
const devLibPath = fileURLToPath(new URL('../lib', import.meta.url))
const publishedGitWorktreesPath = fileURLToPath(
  new URL(
    '../../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh',
    import.meta.url,
  ),
)
const testDirs: string[] = []

async function makeRepo() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-cleanup-'))
  const liveWorktree = join(dir, 'live-worktree')
  testDirs.push(dir)
  await mkdir(join(dir, 'dev'), { recursive: true })
  await mkdir(liveWorktree, { recursive: true })
  await writeFile(join(dir, 'dev', 'cleanup'), await readFile(cleanupPath, 'utf8'))
  await chmod(join(dir, 'dev', 'cleanup'), 0o755)
  await cp(devLibPath, join(dir, 'dev', 'lib'), { recursive: true })
  await writeFile(
    join(dir, 'dev', 'lib', 'git-worktrees.sh'),
    await readFile(publishedGitWorktreesPath, 'utf8'),
  )
  await writeFile(join(dir, 'current-env-with-unset-optional.sh'), ': "${MISSING_OPTIONAL}"\n')
  await writeFile(
    join(dir, '.env'),
    'source ./current-env-with-unset-optional.sh\nexport DATABASE_URL=postgres://dbhost:15432/voucha-current\n',
  )
  await writeFile(
    join(liveWorktree, 'worktree-env-with-unset-optional.sh'),
    ': "${MISSING_OPTIONAL}"\n',
  )
  await writeFile(
    join(liveWorktree, '.env'),
    'source ./worktree-env-with-unset-optional.sh\nexport DATABASE_URL=postgres://otherhost:25432/voucha-live\n',
  )
  return { dir, liveWorktree }
}

async function makeFakeBin(repoRoot: string, liveWorktree: string) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-cleanup-bin-'))
  testDirs.push(dir)
  await writeFile(
    join(dir, 'git'),
    `#!/usr/bin/env bash
if [ "$1" = "worktree" ] && [ "$2" = "list" ] && [ "$3" = "--porcelain" ]; then
  printf 'worktree %s\nHEAD abc\nbranch refs/heads/test\n\nworktree %s\nHEAD def\nbranch refs/heads/live\n' '${repoRoot}' '${liveWorktree}'
  exit 0
fi
if [ "$1" = "-C" ] && [ "$3" = "worktree" ] && [ "$4" = "list" ] && [ "$5" = "--porcelain" ]; then
  printf 'worktree %s\nHEAD abc\nbranch refs/heads/test\n\nworktree %s\nHEAD def\nbranch refs/heads/live\n' '${repoRoot}' '${liveWorktree}'
  exit 0
fi
if [ "$1" = "-C" ] && [ "$3" = "branch" ] && [ "$4" = "--show-current" ]; then
  printf 'test-branch'
  exit 0
fi
printf 'unexpected git invocation: %s\n' "$*" >&2
exit 1
`,
  )
  await chmod(join(dir, 'git'), 0o755)
  await writeFile(
    join(dir, 'psql'),
    `#!/usr/bin/env bash
printf 'psql env PGHOST=%s PGPORT=%s args=%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "\${FAKE_COMMAND_LOG:?}"
printf '%b' "\${FAKE_DATABASE_ROWS:- voucha-live | owner\\n voucha-d111111111111 | owner\\n}"
`,
  )
  await chmod(join(dir, 'psql'), 0o755)
  await writeFile(
    join(dir, 'dropdb'),
    `#!/usr/bin/env bash
printf 'dropdb env PGHOST=%s PGPORT=%s args=%s\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "\${FAKE_COMMAND_LOG:?}"
`,
  )
  await chmod(join(dir, 'dropdb'), 0o755)
  await writeFile(
    join(dir, 'docker'),
    `#!/usr/bin/env bash
if [ "$1" = "ps" ]; then
  printf '%b' "\${FAKE_CONTAINER_ROWS:-}"
elif [ "$1" = "rm" ] && [ "$2" = "-f" ]; then
  printf 'docker rm -f %s\n' "$3" >> "\${FAKE_COMMAND_LOG:?}"
fi
`,
  )
  await chmod(join(dir, 'docker'), 0o755)
  return dir
}

async function runCleanup(cwd: string, binDir: string, env: Record<string, string> = {}) {
  const logPath = join(cwd, 'commands.log')
  await execFileAsync('bash', [join(cwd, 'dev', 'cleanup'), '--yes'], {
    cwd,
    env: {
      ...process.env,
      HOME: cwd,
      ...env,
      FAKE_COMMAND_LOG: logPath,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  })
  return readFile(logPath, 'utf8').catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return ''
    }
    throw error
  })
}

describe('dev/cleanup database host handling', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('scans and drops orphaned databases using the current DATABASE_URL host and port', async () => {
    const { dir, liveWorktree } = await makeRepo()
    const log = await runCleanup(dir, await makeFakeBin(dir, liveWorktree), {
      VOUCHA_ALLOW_NON_LOCAL_DB_CLEANUP: '1',
    })

    expect(log).toContain('psql env PGHOST=dbhost PGPORT=15432 args=-lqt')
    expect(log).toContain('dropdb env PGHOST=dbhost PGPORT=15432 args=voucha-d111111111111')
    expect(log).not.toContain('dropdb env PGHOST=dbhost PGPORT=15432 args=voucha-live')
  })

  it('retains legacy resources after migration while removing unreferenced hashed resources', async () => {
    const { dir, liveWorktree } = await makeRepo()
    const legacyEnv = `export DATABASE_URL=postgres://dbhost:15432/voucha-legacy
export VALKEY_CONTAINER=voucha-valkey-legacy
`
    await writeFile(join(dir, '.env'), legacyEnv)
    await writeFile(join(liveWorktree, '.env'), legacyEnv)
    const binDir = await makeFakeBin(dir, liveWorktree)
    const cleanupEnv = {
      VOUCHA_ALLOW_NON_LOCAL_DB_CLEANUP: '1',
    }

    const beforeMigration = await runCleanup(dir, binDir, {
      ...cleanupEnv,
      FAKE_CONTAINER_ROWS: 'voucha-valkey-legacy\n',
      FAKE_DATABASE_ROWS: ' voucha-legacy | owner\n',
    })
    expect(beforeMigration).not.toContain('args=voucha-legacy')
    expect(beforeMigration).not.toContain('docker rm -f voucha-valkey-legacy')

    await writeFile(
      join(dir, '.env'),
      `export DATABASE_URL=postgres://dbhost:15432/voucha-d0123456789ab
export VALKEY_CONTAINER=voucha-valkey-d0123456789ab
`,
    )
    const oneReference = await runCleanup(dir, binDir, {
      ...cleanupEnv,
      FAKE_CONTAINER_ROWS: 'voucha-valkey-legacy\nvoucha-valkey-d0123456789ab\n',
      FAKE_DATABASE_ROWS: ' voucha-legacy | owner\n voucha-d0123456789ab | owner\n',
    })
    expect(oneReference).not.toContain('args=voucha-legacy')
    expect(oneReference).not.toContain('docker rm -f voucha-valkey-legacy')

    await writeFile(
      join(liveWorktree, '.env'),
      `export DATABASE_URL=postgres://otherhost:25432/voucha-dabcdef012345
export VALKEY_CONTAINER=voucha-valkey-dabcdef012345
`,
    )
    const finalMigration = await runCleanup(dir, binDir, {
      ...cleanupEnv,
      FAKE_CONTAINER_ROWS:
        'voucha-valkey-legacy\nvoucha-valkey-d0123456789ab\nvoucha-valkey-dabcdef012345\nvoucha-valkey-d999999999999\n',
      FAKE_DATABASE_ROWS:
        ' voucha-legacy | owner\n voucha-d0123456789ab | owner\n voucha-dabcdef012345 | owner\n voucha-d999999999999 | owner\n',
    })
    expect(finalMigration).not.toContain('args=voucha-legacy')
    expect(finalMigration).not.toContain('docker rm -f voucha-valkey-legacy')
    expect(finalMigration).toContain('args=voucha-d999999999999')
    expect(finalMigration).toContain('docker rm -f voucha-valkey-d999999999999')
    expect(finalMigration).not.toContain('args=voucha-d0123456789ab')
    expect(finalMigration).not.toContain('args=voucha-dabcdef012345')
  })

  it.each([
    [
      'database',
      {
        FAKE_CONTAINER_ROWS: '',
        FAKE_DATABASE_ROWS: ' voucha-d0123456789ab | owner\n',
      },
    ],
    [
      'Valkey container',
      {
        FAKE_CONTAINER_ROWS: 'voucha-valkey-d0123456789ab\n',
        FAKE_DATABASE_ROWS: ' \n',
      },
    ],
  ])('does not delete a %s when a live owner identity cannot be generated', async (_kind, rows) => {
    const { dir, liveWorktree } = await makeRepo()
    await unlink(join(liveWorktree, '.env'))
    await writeFile(join(liveWorktree, '.git'), 'gitdir: /fake/.git/worktrees/live\n')
    const binDir = await makeFakeBin(dir, liveWorktree)
    await writeFile(join(binDir, 'openssl'), '#!/usr/bin/env bash\nexit 23\n')
    await chmod(join(binDir, 'openssl'), 0o755)
    const logPath = join(dir, 'commands.log')

    await expect(
      execFileAsync('bash', [join(dir, 'dev', 'cleanup'), '--yes'], {
        cwd: dir,
        env: {
          ...process.env,
          HOME: dir,
          ...rows,
          FAKE_COMMAND_LOG: logPath,
          PATH: `${binDir}:${process.env.PATH}`,
          VOUCHA_ALLOW_NON_LOCAL_DB_CLEANUP: '1',
        },
      }),
    ).rejects.toMatchObject({ code: 1 })

    const log = await readFile(logPath, 'utf8')
    expect(log).not.toContain('dropdb env')
    expect(log).not.toContain('docker rm -f')
  })

  it('uses DATABASE_URL host and port before explicit PGHOST or PGPORT', async () => {
    const { dir, liveWorktree } = await makeRepo()
    const log = await runCleanup(dir, await makeFakeBin(dir, liveWorktree), {
      PGHOST: 'socket-host',
      PGPORT: '6543',
      VOUCHA_ALLOW_NON_LOCAL_DB_CLEANUP: '1',
    })

    expect(log).toContain('psql env PGHOST=dbhost PGPORT=15432 args=-lqt')
    expect(log).toContain('dropdb env PGHOST=dbhost PGPORT=15432 args=voucha-d111111111111')
  })

  it('ignores ambient DATABASE_URL when the current worktree has no .env', async () => {
    const { dir, liveWorktree } = await makeRepo()
    await unlink(join(dir, '.env'))
    const log = await runCleanup(dir, await makeFakeBin(dir, liveWorktree), {
      DATABASE_URL: 'postgres://dbhost:15432/voucha-ambient',
      VOUCHA_ALLOW_NON_LOCAL_DB_CLEANUP: '1',
    })

    expect(log).toContain('psql env PGHOST= PGPORT= args=-lqt')
    expect(log).toContain('dropdb env PGHOST= PGPORT= args=voucha-d111111111111')
  })

  it('skips orphan database cleanup on non-local hosts without opt-in', async () => {
    const { dir, liveWorktree } = await makeRepo()
    const log = await runCleanup(dir, await makeFakeBin(dir, liveWorktree))

    expect(log).not.toContain('dropdb env')
  })

  it('recognizes quoted and escaped live worktree DATABASE_URL assignments', async () => {
    const { dir, liveWorktree } = await makeRepo()
    await writeFile(
      join(liveWorktree, '.env'),
      'export DATABASE_URL=postgres://otherhost:25432/voucha-live\\?sslmode=disable\n',
    )
    const log = await runCleanup(dir, await makeFakeBin(dir, liveWorktree), {
      VOUCHA_ALLOW_NON_LOCAL_DB_CLEANUP: '1',
    })

    expect(log).not.toContain('dropdb env PGHOST=dbhost PGPORT=15432 args=voucha-live')
  })

  it('skips hostaddr, service, and mixed-host cleanup targets without opt-in', async () => {
    for (const databaseUrl of [
      'postgresql:///voucha-current?hostaddr=10.0.0.5',
      'postgresql:///voucha-current?service=shared',
      'postgresql://127.0.0.1:5432,dbhost:5432/voucha-current',
    ]) {
      const { dir, liveWorktree } = await makeRepo()
      await writeFile(join(dir, '.env'), `export DATABASE_URL=${databaseUrl}\n`)
      const log = await runCleanup(dir, await makeFakeBin(dir, liveWorktree))

      expect(log).not.toContain('dropdb env')
    }
  })
})
