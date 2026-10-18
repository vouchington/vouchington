import { createBoundedCursorApi } from './bounded-cursor-api.mts'
import pg from 'pg'
import onError from '@modules/on-error'
import { createPsql, type Psql } from '@vouchington/postgres'
import { resolveDatabaseConnectionString } from './connection-string-env.mts'
import { withLibpqCompat } from './connection-string-utils.mts'
import { getPsqlPoolConfiguration } from './pool-config.mts'
import { registerPsqlPoolMetricsForTestEnvironment } from './pool-metrics.mts'
import { startConfiguredPoolStatsSampler } from './pool-stats-sampler.mts'
import { maybeCaptureQuery, runWithSingleQueryCapture } from './query-capture.mts'
import { recordQueryTiming } from './query-telemetry.mts'
import { assertNotCrossWorktreeConnection } from './worktree-guard.mts'

const { Pool } = pg

export const databaseName = 'voucha'
const connectionString = withLibpqCompat(resolveDatabaseConnectionString())
assertNotCrossWorktreeConnection(connectionString)
const readConnectionString = withLibpqCompat(process.env.READ_DATABASE_URL || connectionString)
assertNotCrossWorktreeConnection(readConnectionString)

const poolConfiguration = getPsqlPoolConfiguration()
const vouchaMigrationExtensions = [
  'vector',
  'pgcrypto',
  'pg_trgm',
  'pg_stat_statements',
  'unaccent',
] as const

export const psql: Psql = await createPsql({
  connectionString,
  readConnectionString,
  databaseName,
  errorHandler: onError,
  onQueryTiming: recordQueryTiming,
  onBeforeQuery: maybeCaptureQuery,
  vector: !process.env.NODE_PREWARM,
  migrationExtensions: vouchaMigrationExtensions,
})
export const writePool = psql.writePool
export const advisoryLockPool = psql.advisoryLockPool
export const readPool = psql.readPool
// Long-running job serialization must not occupy the advisory pool used by nested vote locks.
export const jobSerializationPool = new Pool({
  ...poolConfiguration.common,
  connectionString,
  max: poolConfiguration.advisoryLockMax,
})
jobSerializationPool.on('error', onError)
const runtimeQuery = psql.query
const runtimeRead = psql.read
const runtimeWrite = psql.write
export const query: Psql['query'] = (input, valuesOrOptions, options) =>
  runWithSingleQueryCapture(() => runtimeQuery(input, valuesOrOptions, options))
export const read: Psql['read'] = (input, valuesOrOptions, options) =>
  runWithSingleQueryCapture(() => runtimeRead(input, valuesOrOptions, options))
export const write: Psql['write'] = (input, valuesOrOptions, options) =>
  runWithSingleQueryCapture(() => runtimeWrite(input, valuesOrOptions, options))
export const { createAsyncGeneratorFromCursor, executeHandlerWithCursorInBatches } =
  createBoundedCursorApi(psql)
export const close: Psql['close'] = async () => {
  await Promise.all([psql.close(), jobSerializationPool.end()])
}

registerPsqlPoolMetricsForTestEnvironment(
  {
    write: writePool,
    read: readPool,
    advisoryLock: advisoryLockPool,
    jobSerialization: jobSerializationPool,
  },
  process.env.NODE_ENV,
)
startConfiguredPoolStatsSampler(
  { ...psql, jobSerializationPool },
  poolConfiguration,
  Boolean(process.env.NODE_PREWARM),
)

export { Pool }
