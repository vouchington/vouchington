import path from 'node:path'
import type { QueryExecutor } from '../types.mts'
import { runConfigDrivenStatementsInTransaction } from './config-driven-statements.mts'
import { getFilesFromFolder, readMigrationFile } from './files.mts'
import { silentMigrationLogger, type MigrationLogger } from './migration-logger.mts'

export { type MigrationLogger } from './migration-logger.mts'

const isTest = process.env.NODE_ENV === 'test'
const postgresDeadlockSqlstate = '40P01'
const postgresLockTimeoutSqlstate = '55P03'
const configDrivenMaxAttempts = 3
const configDrivenRetryDelayMs = isTest ? 0 : 1000
const configDrivenLockTimeoutMs = 5_000

export interface RunConfigDrivenOptions {
  folder?: string
  logger?: MigrationLogger
  writer?: QueryExecutor
  lockTimeoutMs?: number
}

export async function runConfigDriven(
  rootDir: string,
  loggerOrOptions: MigrationLogger | RunConfigDrivenOptions = silentMigrationLogger,
) {
  // Accept both legacy (logger) and new options-object signatures
  const options: RunConfigDrivenOptions =
    'log' in loggerOrOptions ? { logger: loggerOrOptions } : loggerOrOptions
  const logger = options.logger ?? silentMigrationLogger
  const configDrivenFolder = options.folder ?? path.resolve(rootDir, 'config-driven')
  const lockTimeoutMs = options.lockTimeoutMs ?? configDrivenLockTimeoutMs
  const configDriven = getFilesFromFolder(configDrivenFolder)

  async function runConfigDrivenAt(index: number): Promise<void> {
    const file = configDriven[index]
    if (!file) return

    // ast-grep-ignore: no-three-sequential-awaits -- config-driven files must read and execute in sorted order
    const string = await readMigrationFile(configDrivenFolder, file)
    await runConfigDrivenFile(file, string, logger, options.writer, lockTimeoutMs)

    await runConfigDrivenAt(index + 1)
  }

  await runConfigDrivenAt(0)
}

async function runConfigDrivenFile(
  file: string,
  sql: string,
  logger: MigrationLogger,
  writer: QueryExecutor | undefined,
  lockTimeoutMs: number,
  attempt = 1,
): Promise<void> {
  // Retries replay the whole config-driven file, which is safe only for the idempotent
  // seed/function SQL enforced by no-mistakes postgres-idempotent-insert.
  try {
    await runConfigDrivenStatementsInTransaction(sql, writer, lockTimeoutMs)
    logger.log('Config-driven migration %s complete!', file)
  } catch (err) {
    if (isRetryableConfigDrivenPostgresError(err) && attempt < configDrivenMaxAttempts) {
      logger.log(
        'Config-driven migration %s hit PostgreSQL lock contention (%s); retrying attempt %d of %d.',
        file,
        err.code,
        attempt + 1,
        configDrivenMaxAttempts,
      )
      await waitForConfigDrivenRetry(attempt)
      await runConfigDrivenFile(file, sql, logger, writer, lockTimeoutMs, attempt + 1)
      return
    }

    logger.error('ERROR: running config-driven migration %s failed!', file)
    logger.error(sql)
    logger.error('ERROR: running config-driven migration %s failed after SQL dump!', file)
    throw err
  }
}

function isRetryableConfigDrivenPostgresError(err: unknown): err is { code: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err.code === postgresDeadlockSqlstate || err.code === postgresLockTimeoutSqlstate)
  )
}

async function waitForConfigDrivenRetry(attempt: number) {
  await new Promise(resolve =>
    setTimeout(resolve, Math.min(configDrivenRetryDelayMs * (attempt + Math.random()), 5_000)),
  )
}
