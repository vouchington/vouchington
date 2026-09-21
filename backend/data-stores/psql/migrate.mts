import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import onError, { flushSentry } from '@modules/on-error'
import {
  cleanupPartitions,
  createMonthlyPartitions,
  dropRssFeedCrawlsDefaultPartition,
} from './migration-runner/monthly-partitions.mts'
import {
  runConfigDriven as runConfigDrivenFromFolder,
  type RunConfigDrivenOptions,
} from './migration-runner/migrations.mts'
import { runViews as runViewsFromFolder, type RunViewsOptions } from './migration-runner/views.mts'
import { refreshMaterializedView } from './migration-runner/refresh-materialized-view.mts'
import { loadSqlParserModule } from './migration-runner/sql-statements.mts'
import { verifyLiveSchemaMatchesSnapshot } from './schema-snapshot/verify-live-schema.mts'
import { psql } from './setup.mts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export {
  cleanupPartitions,
  createMonthlyPartitions,
  refreshMaterializedView,
  type RunConfigDrivenOptions,
  type RunViewsOptions,
}

export async function runMigrations() {
  await psql.runMigrations(path.resolve(__dirname, 'migrations'), console)
}

export async function runViews(options: RunViewsOptions = {}) {
  await runViewsFromFolder(__dirname, { logger: console, ...options })
}

export async function runConfigDriven(options: RunConfigDrivenOptions = {}) {
  await dropRssFeedCrawlsDefaultPartition()
  await runConfigDrivenFromFolder(__dirname, { logger: console, ...options })
}

export type PostCommitMigrationHook = () => Promise<void>

export async function applyAllMigrations(
  rootDir = __dirname,
  options: {
    forced?: boolean
    logger?: Pick<Console, 'error' | 'log'>
    afterCommit?: PostCommitMigrationHook
  } = {},
): Promise<void> {
  const logger = options.logger ?? console
  await applyMigrationsInSession(rootDir, options.forced, logger)
  await options.afterCommit?.()
}

async function applyMigrationsInSession(
  rootDir: string,
  forced: boolean | undefined,
  logger: Pick<Console, 'error' | 'log'>,
): Promise<void> {
  await loadSqlParserModule()
  await psql.withMigrationSession(async client => {
    const writer: NonNullable<RunConfigDrivenOptions['writer']> = (input, values) =>
      psql.write(input, values, { client })
    await psql.runMigrations(path.resolve(rootDir, 'migrations'), {
      client,
      logger,
    })
    if (path.resolve(rootDir) === path.resolve(__dirname)) {
      await dropRssFeedCrawlsDefaultPartition()
    }
    await runConfigDrivenFromFolder(rootDir, { logger, writer })
    await runViewsFromFolder(rootDir, { forced, logger, writer })
  })
}

export type VerifySchemaAfterMigration = () => Promise<void>

export async function runAllMigrations(
  options: {
    apply?: typeof applyAllMigrations
    afterCommit?: PostCommitMigrationHook
    exit?: typeof process.exit
    logger?: Pick<Console, 'error' | 'log'>
    verifySchema?: VerifySchemaAfterMigration
  } = {},
): Promise<void> {
  const apply = options.apply ?? applyAllMigrations
  const exit = options.exit ?? process.exit
  const logger = options.logger ?? console
  const verifySchema = options.verifySchema ?? verifyLiveSchemaMatchesSnapshot
  let migrationsApplied = false
  try {
    const applyOptions: Parameters<typeof apply>[1] = {
      forced: process.argv.includes('--forced'),
    }
    if (options.afterCommit) applyOptions.afterCommit = options.afterCommit
    await apply(__dirname, applyOptions)
    migrationsApplied = true
    // Confirms the live schema actually matches what the migration ledger claims was applied.
    // This is what would have caught the incident: a migration file edited in place after
    // staging already ran the old version left staging with a missing column and a missing
    // table, and nothing verified the resulting schema. Throws (failing this task's exit code)
    // when live schema drifts from the committed snapshot.
    await verifySchema()
    logger.log('Migrations complete!')
  } catch (err) {
    const failure = new Error(
      migrationsApplied
        ? 'Migrations committed, but schema verification did not complete successfully.'
        : 'Migration application did not complete; previously applied schema changes may have committed.',
      { cause: err },
    )
    logger.error(failure)
    onError(failure)
    await flushSentry()
    return exit(1)
  }
  exit(0)
}

// realpathSync resolves symlinks so this guard works when the script is invoked
// via a node_modules symlink (e.g. in the production ECS image).
if (process.argv?.[1] && realpathSync(process.argv[1]) === __filename) {
  /* c8 ignore next -- direct-execution entry; exercised by the docker migrate smoke. */
  await runAllMigrations()
}
