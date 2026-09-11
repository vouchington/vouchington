import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import {
  type BenchmarkDatabase,
  createBenchmarkCleanup,
  createFreshBenchmarkDatabase,
  databaseUrlWithName,
} from './database-lifecycle.mts'
import { measureTopicMetricsBenchmark } from './measure.mts'
import { seedTopicMetricsBenchmark } from './seed.mts'

const exec = promisify(execFile)
const databaseName = process.env.BENCHMARK_TOPIC_METRICS_DB
const sourceDatabaseName = process.env.BENCHMARK_TOPIC_METRICS_SOURCE_DB
const label = process.env.BENCHMARK_TOPIC_METRICS_LABEL
if (!databaseName || !sourceDatabaseName || (label !== 'baseline' && label !== 'candidate')) {
  throw new Error('invalid benchmark environment')
}

const root = resolve(import.meta.dirname, '../../../../../')
const sourceDatabaseUrl = process.env.DATABASE_URL
if (!sourceDatabaseUrl) throw new Error('DATABASE_URL must name the source database')
const benchmarkUrl = databaseUrlWithName(sourceDatabaseUrl, databaseName)
const processEnvironment = {
  ...process.env,
  DATABASE_URL: benchmarkUrl,
  READ_DATABASE_URL: benchmarkUrl,
}
let benchmarkDatabase: { drop: () => Promise<void> } | undefined
let databaseCreation: Promise<BenchmarkDatabase> | undefined
let closePools: (() => Promise<void>) | undefined
const cleanup = createBenchmarkCleanup({
  closePools: async () => {
    await closePools?.()
  },
  getDatabase: () => benchmarkDatabase,
  waitForDatabaseCreation: async () => {
    await databaseCreation
  },
})
const signals = ['SIGINT', 'SIGTERM'] as const
let signalCleanup: Promise<void> | undefined

function handleSignal(): void {
  signalCleanup ??= cleanup()
    .catch(error => console.error('Benchmark cleanup failed', error))
    .finally(() => process.exit(128))
}

for (const signal of signals) process.once(signal, handleSignal)

try {
  databaseCreation = createFreshBenchmarkDatabase(
    exec,
    sourceDatabaseUrl,
    databaseName,
    database => {
      benchmarkDatabase = database
    },
  )
  await databaseCreation
  await exec('pnpm', ['--dir', 'backend', 'db:migrate'], {
    cwd: root,
    env: processEnvironment,
  })
  process.env.DATABASE_URL = benchmarkUrl
  process.env.READ_DATABASE_URL = benchmarkUrl

  const core = await import('../../seed-data/core.mts')
  const engagement = await import('../../seed-data/engagement.mts')
  const maintenance = await import('../../seed-data/maintenance.mts')
  const psql = await import('@data-stores/psql')
  const { gracefulShutdown } = await import('@data-stores/graceful-shutdown')
  const { getTopicMetricsByAnyBatch } = await import('@services/topics/metrics-batch')
  closePools = gracefulShutdown

  const seed = await seedTopicMetricsBenchmark({
    core,
    engagement,
    maintenance,
    read: psql.read,
    write: psql.write,
    getTopicMetrics: getTopicMetricsByAnyBatch,
  })
  const measurements = await measureTopicMetricsBenchmark({
    topicIds: seed.topicIds,
    readPool: psql.readPool,
    getTopicMetrics: getTopicMetricsByAnyBatch,
    clearCapturedQueries: psql.clearCapturedQueries,
    enableQueryCapture: psql.enableQueryCapture,
    disableQueryCapture: psql.disableQueryCapture,
    getCapturedQueries: psql.getCapturedQueries,
    explainAnalyze: psql.explainAnalyze,
  })
  const environment = {
    node: process.version,
    commit: (await exec('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim(),
    postgres: (
      await psql.read<{ server_version: string }>(
        '/* benchmarkTopicMetricsServerVersion */ SHOW server_version',
      )
    ).rows[0]?.server_version,
    workMem: (
      await psql.read<{ work_mem: string }>('/* benchmarkTopicMetricsWorkMem */ SHOW work_mem')
    ).rows[0]?.work_mem,
  }

  const outputDirectory = join(import.meta.dirname, '..', '..', 'output')
  await mkdir(outputDirectory, { recursive: true })
  const outputPath = join(
    outputDirectory,
    `topic-metrics-benchmark-${label}-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`,
  )
  await writeFile(
    outputPath,
    JSON.stringify(
      {
        label,
        database: databaseName,
        sourceDatabase: sourceDatabaseName,
        seed: {
          associationCounts: seed.associationCounts,
          associationTotal: seed.associationTotal,
          topicCount: seed.topicIds.length,
        },
        environment,
        ...measurements,
      },
      null,
      2,
    ),
  )
  console.log(`Benchmark results written to ${outputPath}`)
} finally {
  for (const signal of signals) process.off(signal, handleSignal)
  await cleanup()
}
