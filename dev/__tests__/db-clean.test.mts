import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const scriptDir = fileURLToPath(new URL('..', import.meta.url))
const testDirs: string[] = []
async function copyLib(dir: string, name: string) {
  const source =
    name === 'git-worktrees.sh'
      ? '../node_modules/vouchington-tooling/scripts/worktree/git-worktrees.sh'
      : `lib/${name}`
  await writeFile(join(dir, 'dev', 'lib', name), await readFile(join(scriptDir, source), 'utf8'))
}

async function makeRepo(databaseUrl: string) {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-db-clean-'))
  testDirs.push(dir)
  await mkdir(join(dir, 'dev', 'lib'), { recursive: true })
  await writeFile(join(dir, 'dev', 'db-clean'), await readFile(join(scriptDir, 'db-clean'), 'utf8'))
  await chmod(join(dir, 'dev', 'db-clean'), 0o755)
  await copyLib(dir, 'refuse-on-main.sh')
  await copyLib(dir, 'db-name-from-url.sh')
  await copyLib(dir, 'db-target.sh')
  await copyLib(dir, 'flush-valkey.sh')
  await copyLib(dir, 'git-worktrees.sh')
  await copyLib(dir, 'worktree-resource-env.sh')
  await writeFile(join(dir, '.git'), 'gitdir: /fake/.git/worktrees/test\n')
  const physicalDir = await realpath(dir)
  const worktreeDir = `d${createHash('sha256').update(physicalDir).digest('hex').slice(0, 12)}`
  await writeFile(
    join(dir, '.env'),
    `export DATABASE_URL='${databaseUrl}'\nexport WORKTREE_DIR='${worktreeDir}'\n`,
  )
  return dir
}

async function makeFakeBin() {
  const dir = await mkdtemp(join(tmpdir(), 'voucha-db-clean-bin-'))
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
printf 'dropdb env PGHOST=%s PGHOSTADDR=%s PGPORT=%s args=%s\n' "\${PGHOST:-}" "\${PGHOSTADDR:-}" "\${PGPORT:-}" "$*" >> "\${FAKE_COMMAND_LOG:?}"
printf 'dropdb auth PGUSER=%s PGPASSWORD=%s\n' "\${PGUSER:-}" "\${PGPASSWORD:-}" >> "\${FAKE_COMMAND_LOG:?}"
printf 'dropdb ssl PGSSLMODE=%s PGSSLROOTCERT=%s\n' "\${PGSSLMODE:-}" "\${PGSSLROOTCERT:-}" >> "\${FAKE_COMMAND_LOG:?}"
printf 'dropdb service PGSERVICE=%s PGSERVICEFILE=%s\n' "\${PGSERVICE:-}" "\${PGSERVICEFILE:-}" >> "\${FAKE_COMMAND_LOG:?}"
printf 'dropdb target PGTARGETSESSIONATTRS=%s\n' "\${PGTARGETSESSIONATTRS:-}" >> "\${FAKE_COMMAND_LOG:?}"
`,
  )
  await chmod(join(dir, 'dropdb'), 0o755)
  await writeFile(
    join(dir, 'createdb'),
    `#!/usr/bin/env bash
printf 'createdb env PGHOST=%s PGHOSTADDR=%s PGPORT=%s args=%s\n' "\${PGHOST:-}" "\${PGHOSTADDR:-}" "\${PGPORT:-}" "$*" >> "\${FAKE_COMMAND_LOG:?}"
printf 'createdb auth PGUSER=%s PGPASSWORD=%s\n' "\${PGUSER:-}" "\${PGPASSWORD:-}" >> "\${FAKE_COMMAND_LOG:?}"
printf 'createdb ssl PGSSLMODE=%s PGSSLROOTCERT=%s\n' "\${PGSSLMODE:-}" "\${PGSSLROOTCERT:-}" >> "\${FAKE_COMMAND_LOG:?}"
printf 'createdb service PGSERVICE=%s PGSERVICEFILE=%s\n' "\${PGSERVICE:-}" "\${PGSERVICEFILE:-}" >> "\${FAKE_COMMAND_LOG:?}"
printf 'createdb target PGTARGETSESSIONATTRS=%s\n' "\${PGTARGETSESSIONATTRS:-}" >> "\${FAKE_COMMAND_LOG:?}"
`,
  )
  await chmod(join(dir, 'createdb'), 0o755)
  return dir
}

async function runDbClean(cwd: string, binDir: string, env: Record<string, string> = {}) {
  const logPath = join(cwd, 'commands.log')
  await execFileAsync('bash', [join(cwd, 'dev', 'db-clean'), '--db-only'], {
    cwd,
    env: {
      ...process.env,
      VOUCHA_ALLOW_NON_LOCAL_DB_CLEAN: '1',
      ...env,
      FAKE_COMMAND_LOG: logPath,
      PATH: `${binDir}:${process.env.PATH}`,
    },
  })
  return readFile(logPath, 'utf8')
}

describe('dev/db-clean', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('uses the DATABASE_URL host and port when recreating the database', async () => {
    const cwd = await makeRepo('postgres://localhost:15432/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=localhost PGHOSTADDR= PGPORT=15432 args=--if-exists -- voucha-test',
    )
    expect(log).toContain(
      'createdb env PGHOST=localhost PGHOSTADDR= PGPORT=15432 args=-- voucha-test',
    )
  })

  it('leaves PGPORT unset when DATABASE_URL has no port', async () => {
    const cwd = await makeRepo('postgres://localhost/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=localhost PGHOSTADDR= PGPORT= args=--if-exists -- voucha-test',
    )
    expect(log).toContain('createdb env PGHOST=localhost PGHOSTADDR= PGPORT= args=-- voucha-test')
  })

  it('strips brackets from an IPv6 DATABASE_URL host and preserves its port', async () => {
    const cwd = await makeRepo('postgres://[::1]:15432/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=::1 PGHOSTADDR= PGPORT=15432 args=--if-exists -- voucha-test',
    )
    expect(log).toContain('createdb env PGHOST=::1 PGHOSTADDR= PGPORT=15432 args=-- voucha-test')
  })

  it('leaves PGPORT unset when an IPv6 DATABASE_URL host has no port', async () => {
    const cwd = await makeRepo('postgres://[::1]/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=::1 PGHOSTADDR= PGPORT= args=--if-exists -- voucha-test',
    )
    expect(log).toContain('createdb env PGHOST=::1 PGHOSTADDR= PGPORT= args=-- voucha-test')
  })

  it('uses DATABASE_URL credentials for bare PostgreSQL commands', async () => {
    const cwd = await makeRepo('postgres://dbuser:dbpass@dbhost:15432/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=--if-exists -- voucha-test',
    )
    expect(log).toContain('dropdb auth PGUSER=dbuser PGPASSWORD=dbpass')
    expect(log).toContain('createdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=-- voucha-test')
    expect(log).toContain('createdb auth PGUSER=dbuser PGPASSWORD=dbpass')
  })

  it('uses libpq query host and port when the URI has no authority host', async () => {
    const cwd = await makeRepo('postgresql:///voucha-test?host=dbhost&port=15432')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=--if-exists -- voucha-test',
    )
    expect(log).toContain('createdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=-- voucha-test')
  })

  it('decodes DATABASE_URL credentials for bare PostgreSQL commands', async () => {
    const cwd = await makeRepo('postgres://dbuser:p%40ss@dbhost:15432/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain('dropdb auth PGUSER=dbuser PGPASSWORD=p@ss')
    expect(log).toContain('createdb auth PGUSER=dbuser PGPASSWORD=p@ss')
  })

  it('preserves multi-host and multi-port DATABASE_URL authority lists', async () => {
    const cwd = await makeRepo('postgresql://host1:111,host2:222/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=host1,host2 PGHOSTADDR= PGPORT=111,222 args=--if-exists -- voucha-test',
    )
    expect(log).toContain(
      'createdb env PGHOST=host1,host2 PGHOSTADDR= PGPORT=111,222 args=-- voucha-test',
    )
  })

  it('preserves literal plus signs in DATABASE_URL credentials', async () => {
    const cwd = await makeRepo('postgres://dbuser:p+ss@dbhost:15432/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain('dropdb auth PGUSER=dbuser PGPASSWORD=p+ss')
    expect(log).toContain('createdb auth PGUSER=dbuser PGPASSWORD=p+ss')
  })

  it('uses dbname from libpq query params when the URI path is empty', async () => {
    const cwd = await makeRepo('postgresql:///?host=dbhost&port=15432&dbname=voucha-query-db')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=--if-exists -- voucha-query-db',
    )
    expect(log).toContain(
      'createdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=-- voucha-query-db',
    )
  })

  it('uses query-string DATABASE_URL credentials for bare PostgreSQL commands', async () => {
    const cwd = await makeRepo('postgresql://dbhost:15432/voucha-test?user=dbuser&password=dbpass')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain('dropdb auth PGUSER=dbuser PGPASSWORD=dbpass')
    expect(log).toContain('createdb auth PGUSER=dbuser PGPASSWORD=dbpass')
  })

  it('lets the libpq dbname paramspec override the URI path', async () => {
    const cwd = await makeRepo('postgresql://dbhost:15432/voucha-default?dbname=voucha-custom')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=--if-exists -- voucha-custom',
    )
    expect(log).toContain(
      'createdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=-- voucha-custom',
    )
  })

  it('decodes percent-encoded authority socket hosts', async () => {
    const cwd = await makeRepo('postgresql://%2Fvar%2Flib%2Fpostgresql/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=/var/lib/postgresql PGHOSTADDR= PGPORT= args=--if-exists -- voucha-test',
    )
    expect(log).toContain(
      'createdb env PGHOST=/var/lib/postgresql PGHOSTADDR= PGPORT= args=-- voucha-test',
    )
  })

  it('keeps an authority host when dbname is supplied only in query params', async () => {
    const cwd = await makeRepo('postgresql://dbhost?dbname=voucha-test&port=15432')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=--if-exists -- voucha-test',
    )
    expect(log).toContain('createdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=-- voucha-test')
  })

  it('uses libpq hostaddr params for bare PostgreSQL commands', async () => {
    const cwd = await makeRepo('postgresql:///voucha-test?hostaddr=127.0.0.1&port=15432')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST= PGHOSTADDR=127.0.0.1 PGPORT=15432 args=--if-exists -- voucha-test',
    )
    expect(log).toContain(
      'createdb env PGHOST= PGHOSTADDR=127.0.0.1 PGPORT=15432 args=-- voucha-test',
    )
  })

  it('uses libpq environment params for bare PostgreSQL commands', async () => {
    const cwd = await makeRepo(
      'postgresql:///voucha-test?sslmode=verify-full&sslrootcert=%2Ftmp%2Froot.crt&service=devdb&servicefile=%2Ftmp%2Fpg_service.conf&target_session_attrs=read-write',
    )
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain('dropdb ssl PGSSLMODE=verify-full PGSSLROOTCERT=/tmp/root.crt')
    expect(log).toContain('createdb ssl PGSSLMODE=verify-full PGSSLROOTCERT=/tmp/root.crt')
    expect(log).toContain('dropdb service PGSERVICE=devdb PGSERVICEFILE=/tmp/pg_service.conf')
    expect(log).toContain('createdb service PGSERVICE=devdb PGSERVICEFILE=/tmp/pg_service.conf')
    expect(log).toContain('dropdb target PGTARGETSESSIONATTRS=read-write')
    expect(log).toContain('createdb target PGTARGETSESSIONATTRS=read-write')
  })

  it('decodes percent-encoded DATABASE_URL path database names', async () => {
    const cwd = await makeRepo('postgresql://dbhost:15432/voucha%20test')
    const log = await runDbClean(cwd, await makeFakeBin())

    expect(log).toContain(
      'dropdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=--if-exists -- voucha test',
    )
    expect(log).toContain('createdb env PGHOST=dbhost PGHOSTADDR= PGPORT=15432 args=-- voucha test')
  })

  it('uses DATABASE_URL host and port before explicit PGHOST or PGPORT', async () => {
    const cwd = await makeRepo('postgres://localhost:15432/voucha-test')
    const log = await runDbClean(cwd, await makeFakeBin(), {
      PGHOST: 'socket-host',
      PGPORT: '6543',
    })

    expect(log).toContain(
      'dropdb env PGHOST=localhost PGHOSTADDR= PGPORT=15432 args=--if-exists -- voucha-test',
    )
    expect(log).toContain(
      'createdb env PGHOST=localhost PGHOSTADDR= PGPORT=15432 args=-- voucha-test',
    )
  })
})
