import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

import { initializeBashArgs } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)
const testDirs: string[] = []

async function makeWorktreeDir(...parts: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'voucha-dev-initialize-env-url-'))
  const dir = join(root, ...parts)
  await mkdir(dir, { recursive: true })
  testDirs.push(root)
  return dir
}

async function runHelper({ cwd, script }: { cwd: string; script: string }) {
  const result = await execFileAsync('bash', initializeBashArgs(script), {
    cwd,
    env: { ...process.env, HOME: dirname(cwd) },
  })

  return result.stdout.trim()
}

describe('initialize generated DATABASE_URL', () => {
  afterEach(async () => {
    await Promise.all(testDirs.splice(0).map(dir => rm(dir, { force: true, recursive: true })))
  })

  it('includes the effective PGPORT in the generated local DATABASE_URL', async () => {
    const cwd = await makeWorktreeDir('feature-db-url-port')
    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-url-port
    VALKEY_PORT=6379
    WORKTREE_DIR=feature-db-url-port
    BACKEND_PORT=3001
    VALKEY_CONTAINER=voucha-valkey-test
    WORKER_PORT=8788
    IMAGE_LAMBDA_PORT=4001
    NEXT_PORT=3002
    STORYBOOK_PORT=6006
    INSPECTOR_PORT=9229
    CF_WORKER_SECRET=secret
    API_KEY_CHECKSUM_SECRET=checksum
    VOUCHA_OTP_TOKEN_HASH_SECRET=otp
    VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
    FINAL_WEB_PUSH_PUBLIC_KEY=public
    FINAL_WEB_PUSH_PRIVATE_KEY=private
    FINAL_WEB_PUSH_SUBJECT=mailto:tests+db-url@voucha.ai
    PGHOST=localhost
    PGPORT=15432
    unset DATABASE_URL
    write_worktree_env >/dev/null
    grep '^export DATABASE_URL=' .env
    `,
    })

    expect(output).toBe('export DATABASE_URL=postgres://localhost:15432/voucha-feature-db-url-port')
  })

  it('uses the generated PGPORT DATABASE_URL when creating the database', async () => {
    const cwd = await makeWorktreeDir('feature-db-url-port-create')
    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-db-url-port-create
    VALKEY_PORT=6379
    WORKTREE_DIR=feature-db-url-port-create
    BACKEND_PORT=3001
    VALKEY_CONTAINER=voucha-valkey-test
    WORKER_PORT=8788
    IMAGE_LAMBDA_PORT=4001
    NEXT_PORT=3002
    STORYBOOK_PORT=6006
    INSPECTOR_PORT=9229
    CF_WORKER_SECRET=secret
    API_KEY_CHECKSUM_SECRET=checksum
    VOUCHA_OTP_TOKEN_HASH_SECRET=otp
    VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
    FINAL_WEB_PUSH_PUBLIC_KEY=public
    FINAL_WEB_PUSH_PRIVATE_KEY=private
    FINAL_WEB_PUSH_SUBJECT=mailto:tests+db-url-create@voucha.ai
    PGHOST=localhost
    PGPORT=15432
    unset DATABASE_URL
    record=$(mktemp)

    psql() {
      printf 'psql:%s:%s:%s\\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    createdb() {
      printf 'create:%s:%s:%s\\n' "\${PGHOST:-}" "\${PGPORT:-}" "$*" >> "$record"
    }

    write_worktree_env >/dev/null
    set -a
    source .env
    set +a
    ensure_database_exists >/dev/null
    cat "$record"
    `,
    })

    expect(output).toBe(
      'psql:localhost:15432:--dbname=postgres -lqt\ncreate:localhost:15432:voucha-feature-db-url-port-create',
    )
  })

  it('writes CF_WORKER_ROUTE from the worktree worker port', async () => {
    const cwd = await makeWorktreeDir('feature-worker-route')
    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-worker-route
    VALKEY_PORT=6379
    WORKTREE_DIR=feature-worker-route
    BACKEND_PORT=3001
    VALKEY_CONTAINER=voucha-valkey-test
    WORKER_PORT=8788
    IMAGE_LAMBDA_PORT=4001
    NEXT_PORT=3002
    STORYBOOK_PORT=6006
    INSPECTOR_PORT=9229
    CF_WORKER_SECRET=secret
    API_KEY_CHECKSUM_SECRET=checksum
    VOUCHA_OTP_TOKEN_HASH_SECRET=otp
    VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
    FINAL_WEB_PUSH_PUBLIC_KEY=public
    FINAL_WEB_PUSH_PRIVATE_KEY=private
    FINAL_WEB_PUSH_SUBJECT=mailto:tests+route@voucha.ai
    unset CF_WORKER_ROUTE
    write_worktree_env >/dev/null
    grep '^export CF_WORKER_ROUTE=' .env
    `,
    })

    expect(output).toBe('export CF_WORKER_ROUTE=http://localhost:8788')
  })

  it('replaces an inherited shared voucha DATABASE_URL on a disposable clone', async () => {
    const cwd = await makeWorktreeDir('feature-inherited-voucha')
    await mkdir(join(cwd, '.git'), { recursive: true })
    const output = await runHelper({
      cwd,
      script: `
    DB_NAME=voucha-feature-inherited-voucha
    VALKEY_PORT=6379
    WORKTREE_DIR=feature-inherited-voucha
    BACKEND_PORT=3001
    VALKEY_CONTAINER=voucha-valkey-feature-inherited-voucha
    WORKER_PORT=8788
    IMAGE_LAMBDA_PORT=4001
    NEXT_PORT=3002
    STORYBOOK_PORT=6006
    INSPECTOR_PORT=9229
    CF_WORKER_SECRET=secret
    API_KEY_CHECKSUM_SECRET=checksum
    VOUCHA_OTP_TOKEN_HASH_SECRET=otp
    VOUCHA_STORED_SECRET_ENCRYPTION_KEYS=keys
    FINAL_WEB_PUSH_PUBLIC_KEY=public
    FINAL_WEB_PUSH_PRIVATE_KEY=private
    FINAL_WEB_PUSH_SUBJECT=mailto:tests+inherited@voucha.ai
    unset DATABASE_URL
    REPO_ROOT="$(pwd -P)"
    printf 'export WORKTREE_DIR=feature-inherited-voucha\\nexport DATABASE_URL=postgres://localhost/voucha\\n' > .env
    write_worktree_env >/dev/null
    grep '^export DATABASE_URL=' .env
    `,
    })

    expect(output).toContain('voucha-feature-inherited-voucha')
    expect(output).not.toMatch(/\/voucha['"]?$/)
  })
})
