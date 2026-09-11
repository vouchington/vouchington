import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

import { sourceBashArgs } from '../test-helpers/initialize.mts'

const execFileAsync = promisify(execFile)
const dbTargetPath = fileURLToPath(new URL('../lib/db-target.sh', import.meta.url))

async function runDbTarget(script: string) {
  const result = await execFileAsync('bash', sourceBashArgs(dbTargetPath, script))
  return result.stdout.trim()
}

describe('dev DB target helper', () => {
  it('makes DATABASE_URL host and port authoritative over explicit PG env', async () => {
    const output = await runDbTarget(`
      DATABASE_URL=postgres://dbhost:15432/voucha-url-target
      PGHOST=localhost
      PGPORT=5432
      dev_db_target_resolve clean
      dev_db_target_export_pg_env
      printf '%s:%s:%s' "$PGHOST" "$PGPORT" "$DEV_DB_TARGET_DB_NAME"
    `)

    expect(output).toBe('dbhost:15432:voucha-url-target')
  })

  it('clears stale PGHOSTADDR when DATABASE_URL supplies a host', async () => {
    const output = await runDbTarget(`
      DATABASE_URL=postgres://localhost:15432/voucha-url-target
      PGHOSTADDR=192.0.2.10
      dev_db_target_resolve clean
      dev_db_target_export_pg_env
      printf '%s:%s:%s' "$PGHOST" "\${PGHOSTADDR:-}" "$DEV_DB_TARGET_DB_NAME"
    `)

    expect(output).toBe('localhost::voucha-url-target')
  })

  it('preserves URL host and hostaddr when both are provided', async () => {
    const output = await runDbTarget(`
      DATABASE_URL='postgres://dbhost:15432/voucha-url-target?hostaddr=127.0.0.1'
      dev_db_target_resolve clean
      dev_db_target_export_pg_env
      printf '%s:%s:%s' "$PGHOST" "$PGHOSTADDR" "$DEV_DB_TARGET_DB_NAME"
    `)

    expect(output).toBe('dbhost:127.0.0.1:voucha-url-target')
  })

  it('does not fall back to ambient DB_NAME for host-only DATABASE_URL values', async () => {
    const output = await runDbTarget(`
      DATABASE_URL=postgres://localhost
      DB_NAME=voucha-ambient-target
      dev_db_target_resolve clean
      printf '%s:%s' "$DEV_DB_TARGET_DATABASE_URL" "\${DEV_DB_TARGET_DB_NAME:-}"
    `)

    expect(output).toBe('postgres://localhost:')
  })

  it('uses PG env only for URL fields that are omitted', async () => {
    const output = await runDbTarget(`
      DATABASE_URL=postgresql:///voucha-env-target
      PGHOST=/var/run/postgresql
      PGPORT=6543
      dev_db_target_resolve init
      dev_db_target_export_pg_env
      printf '%s:%s:%s' "$PGHOST" "$PGPORT" "$DEV_DB_TARGET_DB_NAME"
    `)

    expect(output).toBe('/var/run/postgresql:6543:voucha-env-target')
  })

  it('generates local DATABASE_URL values with dynamic PGPORT and IPv6 brackets', async () => {
    const output = await runDbTarget(`
      unset DATABASE_URL
      DB_NAME=voucha-generated-target
      PGHOST=::1
      PGPORT=15432
      dev_db_target_resolve init "" "$DB_NAME"
      printf '%s' "$DEV_DB_TARGET_DATABASE_URL"
    `)

    expect(output).toBe('postgres://[::1]:15432/voucha-generated-target')
  })

  it('does not double-wrap already bracketed IPv6 PGHOST values', async () => {
    const output = await runDbTarget(`
      unset DATABASE_URL
      DB_NAME=voucha-generated-target
      PGHOST='[::1]'
      PGPORT=15432
      dev_db_target_resolve init "" "$DB_NAME"
      printf '%s' "$DEV_DB_TARGET_DATABASE_URL"
    `)

    expect(output).toBe('postgres://[::1]:15432/voucha-generated-target')
  })

  it('masks database URL credentials for display', async () => {
    const output = await runDbTarget(`
      dev_db_target_display_database_url 'postgres://user:s3cr3t@dbhost:15432/voucha-display?sslmode=require' ''
      printf '\\n'
      dev_db_target_display_database_url 'postgres://dbhost:15432/voucha-display?user=user&password=s3cr3t' ''
    `)

    expect(output).toBe(
      [
        'postgres://***@dbhost:15432/voucha-display',
        'postgres://***@dbhost:15432/voucha-display',
      ].join('\n'),
    )
  })

  it('treats empty hostaddr entries as non-local unless the operation opt-in is set', async () => {
    const output = await runDbTarget(`
      DATABASE_URL='postgresql:///voucha-hostaddr-target?hostaddr=,'
      dev_db_target_resolve clean
      if dev_db_target_local_or_allowed clean; then
        printf allowed
      else
        printf refused
      fi
    `)

    expect(output).toBe('refused')
  })

  it('allows service-param targets only through the matching operation opt-in', async () => {
    const output = await runDbTarget(`
      DATABASE_URL='postgresql:///voucha-service-target?service=shared'
      VOUCHA_ALLOW_NON_LOCAL_DB_RESET=1
      dev_db_target_resolve reset
      if dev_db_target_local_or_allowed reset; then
        printf allowed
      else
        printf refused
      fi
    `)

    expect(output).toBe('allowed')
  })

  it('maps each write operation to a distinct non-local opt-in variable', async () => {
    const output = await runDbTarget(`
      for operation in init reset clean cleanup teardown; do
        printf '%s=%s\\n' "$operation" "$(dev_db_target_opt_in_env "$operation")"
      done
    `)

    expect(output).toBe(
      [
        'init=VOUCHA_ALLOW_NON_LOCAL_DB_INIT',
        'reset=VOUCHA_ALLOW_NON_LOCAL_DB_RESET',
        'clean=VOUCHA_ALLOW_NON_LOCAL_DB_CLEAN',
        'cleanup=VOUCHA_ALLOW_NON_LOCAL_DB_CLEANUP',
        'teardown=VOUCHA_ALLOW_NON_LOCAL_DB_TEARDOWN',
      ].join('\n'),
    )
  })
})
