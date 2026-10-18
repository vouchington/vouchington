import path from 'node:path'
import type { Psql } from '@vouchington/postgres'
import {
  runViews as runPlatformViews,
  type RunViewsOptions as PlatformRunViewsOptions,
} from '@vouchington/postgres/views'
import onError, { flushSentry } from '@modules/on-error'
import {
  cleanupPartitions,
  createMonthlyPartitions,
} from './migration-runner/monthly-partitions.mts'
import {
  runConfigDriven as runConfigDrivenFromFolder,
  type RunConfigDrivenOptions,
} from './migration-runner/migrations.mts'
import { refreshMaterializedView } from './migration-runner/refresh-materialized-view.mts'
import { initSqlAst, loadSqlParserModule } from './migration-runner/sql-statements.mts'
import { verifyLiveSchemaMatchesSnapshot } from './schema-snapshot/verify-live-schema.mts'
import { psql, write } from './setup.mts'

const __dirname = import.meta.dirname

export type RunViewsOptions = Partial<Omit<PlatformRunViewsOptions, 'folder' | 'writer'>> & {
  folder?: string
  writer?: PlatformRunViewsOptions['writer']
}

export {
  cleanupPartitions,
  createMonthlyPartitions,
  refreshMaterializedView,
  type RunConfigDrivenOptions,
}

export type MigrationPlatform = Pick<Psql, 'runMigrations' | 'withMigrationSession' | 'write'>

export async function runMigrations(platform: Pick<Psql, 'runMigrations'> = psql) {
  const selectedPlatform = platform
  await selectedPlatform.runMigrations(path.resolve(__dirname, 'migrations'), { logger: console })
}

export async function runViews(options: RunViewsOptions = {}) {
  if (options.forced) await initializeMigrationSql()
  const folder = options.folder ?? path.resolve(__dirname, 'views')
  const writer = options.writer ?? write
  const logger = options.logger ?? console
  await runPlatformViews({ ...options, folder, writer, logger })
}

export async function runConfigDriven(options: RunConfigDrivenOptions = {}) {
  await runConfigDrivenFromFolder(__dirname, { logger: console, ...options })
}

export async function applyAllMigrations(
  rootDir = __dirname,
  options: {
    forced?: boolean
    logger?: Pick<Console, 'error' | 'log'>
    platform?: MigrationPlatform
  } = {},
): Promise<void> {
  const logger = options.logger ?? console
  const platform = options.platform ?? psql
  const forced = options.forced
  await applyMigrationsInSession(rootDir, forced, logger, platform)
}

async function applyMigrationsInSession(
  rootDir: string,
  forced: boolean | undefined,
  logger: Pick<Console, 'error' | 'log'>,
  platform: MigrationPlatform,
): Promise<void> {
  await initializeMigrationSql()
  await platform.withMigrationSession(async client => {
    const writer: NonNullable<RunConfigDrivenOptions['writer']> = (input, values) =>
      platform.write(input, values, { client })
    await platform.runMigrations(path.resolve(rootDir, 'migrations'), {
      client,
      logger,
    })
    await runConfigDrivenFromFolder(rootDir, { logger, writer })
    await runPlatformViews({ folder: path.resolve(rootDir, 'views'), forced, logger, writer })
  })
}

async function initializeMigrationSql(): Promise<void> {
  const settled = await Promise.allSettled([
    Promise.resolve().then(() => loadSqlParserModule()),
    Promise.resolve().then(() => initSqlAst()),
  ])
  const failures = settled.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    const cause = failures[0]
    throw new AggregateError(failures, 'Migration SQL initialization failed', { cause })
  }
}

export type VerifySchemaAfterMigration = () => Promise<void>
type MigrationPhase = 'application' | 'verification'

export async function runAllMigrations(
  options: {
    apply?: typeof applyAllMigrations
    exit?: typeof process.exit
    logger?: Pick<Console, 'error' | 'log'>
    verifySchema?: VerifySchemaAfterMigration
  } = {},
): Promise<void> {
  const apply = options.apply ?? applyAllMigrations
  const exit = options.exit ?? process.exit
  const logger = options.logger ?? console
  const verifySchema = options.verifySchema ?? verifyLiveSchemaMatchesSnapshot
  const state: { phase: MigrationPhase } = { phase: 'application' }
  try {
    const applyOptions: Parameters<typeof apply>[1] = {
      forced: process.argv.includes('--forced'),
    }
    await apply(__dirname, applyOptions)
    state.phase = 'verification'
    // Confirms the live schema actually matches what the migration ledger claims was applied.
    // This is what would have caught the incident: a migration file edited in place after
    // staging already ran the old version left staging with a missing column and a missing
    // table, and nothing verified the resulting schema. Throws (failing this task's exit code)
    // when live schema drifts from the committed snapshot.
    await verifySchema()
    logger.log('Migrations complete!')
  } catch (err) {
    const message =
      state.phase === 'verification'
        ? 'Migrations committed, but schema verification did not complete successfully.'
        : 'Migration application did not complete; previously applied schema changes may have committed.'
    const failure = new Error(message, { cause: err })
    logger.error(failure)
    onError(failure)
    await flushSentry()
    return exit(1)
  }
  exit(0)
}

if (import.meta.main) {
  /* c8 ignore next -- direct-execution entry; exercised by the docker migrate smoke. */
  await runAllMigrations()
}
