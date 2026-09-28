import { execFile } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { ExplainResult } from '@data-stores/psql/explain-analyze'
import {
  createOwnedPruningDatabase,
  createPruningDatabaseName,
  type OwnedPruningDatabase,
} from './database-lifecycle.mts'

const exec = promisify(execFile)
const root = resolve(import.meta.dirname, '../../../..')
const sourceUrl = process.env.DATABASE_URL
if (!sourceUrl) throw new Error('DATABASE_URL must name a local source database')
const connectionEnvironment = { ...process.env }
for (const key of ['PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPORT']) {
  delete connectionEnvironment[key]
  delete process.env[key]
}
const runPsql = (file: string, args: string[]) => exec(file, args, { env: connectionEnvironment })

const name = createPruningDatabaseName()
const results: ExplainResult[] = []
const evidence: Record<string, unknown> = { database: name, results }
const outputDirectory = join(import.meta.dirname, '..', 'output')
const outputPath = join(
  outputDirectory,
  `pruning-proof-${new Date().toISOString().replaceAll(/[:.]/g, '-')}.json`,
)
const migrationAbort = new AbortController()
const interrupt = () => migrationAbort.abort()
process.on('SIGINT', interrupt)
process.on('SIGTERM', interrupt)

let owned: OwnedPruningDatabase | undefined
let closePools: (() => Promise<void>) | undefined
let failure: unknown
try {
  owned = await createOwnedPruningDatabase(runPsql, sourceUrl, name, database => {
    owned = database
  })
  const env = { ...connectionEnvironment, DATABASE_URL: owned.url, READ_DATABASE_URL: owned.url }
  await exec('pnpm', ['--dir', 'backend', 'db:migrate'], {
    cwd: root,
    env,
    signal: migrationAbort.signal,
  })
  migrationAbort.signal.throwIfAborted()
  process.env.DATABASE_URL = owned.url
  process.env.READ_DATABASE_URL = owned.url

  // Production psql imports capture the URLs at module load; every import below is deliberately
  // after the owned URL override, including service imports reached through capture.mts.
  const { gracefulShutdown } = await import('@data-stores/graceful-shutdown')
  closePools = gracefulShutdown
  const { write } = await import('@data-stores/psql')
  const { attachProofRanges } = await import('./partitions.mts')
  const { seedPruningProof, assertPruningFixturePlacement } = await import('./seed.mts')
  const { capturePruningProof } = await import('./capture.mts')
  await attachProofRanges(write)
  migrationAbort.signal.throwIfAborted()
  await seedPruningProof()
  migrationAbort.signal.throwIfAborted()
  evidence.fixture = await assertPruningFixturePlacement()
  const captured = await capturePruningProof(result => {
    results.push(result)
    migrationAbort.signal.throwIfAborted()
  })
  evidence.executedLeaves = captured.executedLeaves
  if (results.length !== 20)
    throw new Error(`pruning proof expected 20 plans, got ${results.length}`)
  console.log(`Pruning proof passed ${results.length} forced custom/generic plans`)
} catch (error) {
  failure = error
  evidence.error = error instanceof Error ? error.message : String(error)
} finally {
  try {
    try {
      await mkdir(outputDirectory, { recursive: true })
      await writeFile(outputPath, JSON.stringify(evidence, null, 2))
      console.log(`Pruning proof artifact: ${outputPath}`)
    } finally {
      try {
        await closePools?.()
      } finally {
        await owned?.drop()
      }
    }
  } finally {
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
  }
}
if (failure) throw failure
