import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs, runInitializeHelperStatus } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)
const testDirs: string[] = []

async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

async function runHelper({ cwd, script, home }: { cwd: string; script: string; home?: string }) {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: {
      ...process.env,
      HOME: home ?? dirname(cwd),
    },
  })

  return result.stdout.trim()
}

describe('ensure_database_exists createdb race handling', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('stops on noninteractive authentication failure before attempting creation', async () => {
    const cwd = await makeWorktreeDir('feature-db-auth')
    const result = await runInitializeHelperStatus({
      cwd,
      script: `
DATABASE_URL=postgres://localhost:15432/voucha-feature-db-auth
DB_NAME=voucha-feature-db-auth
psql() {
  case "$*" in
    *--no-password*) echo 'fe_sendauth: no password supplied' >&2; return 1 ;;
    *) return 0 ;;
  esac
}
createdb() { echo unexpected-createdb; }
ensure_database_exists
`,
    })
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('fe_sendauth: no password supplied')
    expect(result.stdout).not.toContain('unexpected-createdb')
  })

  it('treats a createdb "already exists" race as idempotent, not fatal', async () => {
    const cwd = await makeWorktreeDir('feature-db-createdb-exists-race')

    const output = await runHelper({
      cwd,
      script: `
    DATABASE_URL=postgres://localhost:15432/voucha-feature-db-createdb-exists-race
    DB_NAME=voucha-feature-db-createdb-exists-race

    psql() { :; }

    createdb() {
  echo "createdb: error: database creation failed: ERROR:  database \\"$1\\" already exists" >&2
  return 1
    }

    ensure_database_exists >/dev/null && echo reached-after-ensure
    `,
    })

    expect(output).toBe('reached-after-ensure')
  })
})
