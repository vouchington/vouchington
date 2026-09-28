import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  getIsolatedDatabaseCase,
  getIsolatedDatabaseCaseMode,
  makeIsolatedDatabaseName,
  type IsolatedDatabaseCaseId,
} from './vitest-isolated-database-cases.mts'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'

const exec = promisify(execFile)
const root = fileURLToPath(new URL('..', import.meta.url))
const vitestCli = join(
  dirname(fileURLToPath(import.meta.resolve('vitest/package.json'))),
  'vitest.mjs',
)
const isolatedConfig = join(root, 'test-helpers/vitest.config.isolated-database-case.mts')

/** Runs a registered global test against a fresh local database, then drops only that database. */
export async function runIsolatedDatabaseCase(caseId: IsolatedDatabaseCaseId): Promise<void> {
  getIsolatedDatabaseCase(caseId)
  if (getIsolatedDatabaseCaseMode(caseId) !== 'parent') {
    throw new Error(`Isolated database case ${caseId} cannot launch another child`)
  }
  const sourceUrl = process.env.DATABASE_URL
  if (!sourceUrl) throw new Error(`Isolated database case ${caseId} needs DATABASE_URL`)
  const source = new URL(sourceUrl)
  if (
    !['postgres:', 'postgresql:'].includes(source.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(source.hostname) ||
    !source.pathname.slice(1) ||
    source.searchParams.has('host') ||
    source.searchParams.has('hostaddr')
  )
    throw new Error(`Isolated database case ${caseId} requires a local PostgreSQL source`)

  const suffix = randomBytes(12).toString('hex')
  const databaseName = makeIsolatedDatabaseName(suffix)
  const databaseUrl = new URL(source)
  databaseUrl.pathname = `/${databaseName}`
  databaseUrl.searchParams.delete('dbname')
  const queueUrl = new URL(
    process.env.VALKEY_WORKER_QUEUE_URL ??
      process.env.VALKEY_URL ??
      `redis://${process.env.DOCKER_HOST_IP || 'localhost'}:6379`,
  )
  // glide-mq interprets a numeric URL path as a queue-key prefix, not Redis SELECT.
  queueUrl.pathname = `/${BigInt(`0x${suffix}`).toString(10)}`
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    DATABASE_URL: databaseUrl.toString(),
    READ_DATABASE_URL: databaseUrl.toString(),
    VALKEY_WORKER_QUEUE_URL: queueUrl.toString(),
    VITEST_ISOLATED_DATABASE_CASE: caseId,
    VITEST_ISOLATED_DATABASE_CHILD: databaseName,
    VITEST_CI_REPORTERS: undefined,
    VITEST_JUNIT_OUTPUT_FILE: undefined,
    VITEST_BLOB_OUTPUT_FILE: undefined,
    VITEST_COVERAGE_ENABLED: undefined,
  }

  const adminEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: source.hostname.replace(/^\[|\]$/g, ''),
    PGPORT: source.port || '5432',
    PGDATABASE: decodeURIComponent(source.pathname.slice(1)),
    PGHOSTADDR: undefined,
    PGSERVICE: undefined,
    PGSERVICEFILE: undefined,
  }
  if (source.username) adminEnv.PGUSER = decodeURIComponent(source.username)
  if (source.password) adminEnv.PGPASSWORD = decodeURIComponent(source.password)

  const existing = await command(
    'psql',
    [
      '-v',
      'ON_ERROR_STOP=1',
      '-Atqc',
      `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`,
    ],
    adminEnv,
  )
  if (existing.trim()) throw new Error(`Refusing existing isolated database ${databaseName}`)

  let created = false
  let primaryFailure: unknown
  try {
    await command(
      'psql',
      ['-v', 'ON_ERROR_STOP=1', '-qc', `CREATE DATABASE ${databaseName}`],
      adminEnv,
    )
    created = true
    await command('pnpm', ['--dir', 'backend', 'db:migrate'], childEnv, 60_000)
    await command(
      process.execPath,
      [vitestCli, 'run', '--config', isolatedConfig],
      childEnv,
      120_000,
    )
  } catch (error) {
    primaryFailure = error
  }
  if (created) {
    try {
      await command(
        'psql',
        ['-v', 'ON_ERROR_STOP=1', '-qc', `DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`],
        adminEnv,
      )
    } catch (cleanupFailure) {
      if (primaryFailure) {
        throw new AggregateError(
          [primaryFailure, cleanupFailure],
          `Isolated database case ${caseId} failed: ${stringFromUnknown(primaryFailure)}; cleanup also failed`,
          { cause: cleanupFailure },
        )
      }
      throw cleanupFailure
    }
  }
  if (primaryFailure instanceof Error) throw primaryFailure
  if (primaryFailure) throw new Error(stringFromUnknown(primaryFailure))
}

async function command(
  file: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  timeout = 10_000,
): Promise<string> {
  try {
    const result = await exec(file, args, { cwd: root, env, timeout, maxBuffer: 4_000_000 })
    return result.stdout
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string }
    const output = `${failure.stdout ?? ''}\n${failure.stderr ?? ''}`.trim()
    throw new Error(`Isolated database case command ${file} failed:\n${output.slice(-8_000)}`, {
      cause: error,
    })
  }
}
