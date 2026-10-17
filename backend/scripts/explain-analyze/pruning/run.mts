import { execFile, spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { ExplainResult } from '@data-stores/psql/explain-analyze'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import {
  createOwnedPruningDatabase,
  createPruningDatabaseName,
  type OwnedPruningDatabase,
} from './database-lifecycle.mts'

import { assertMigrationRunnerControls } from './migration-controls.mts'
import { assertPruningDatabaseLifecycleControls } from './database-lifecycle-controls.mts'

const exec = promisify(execFile)
const root = resolve(import.meta.dirname, '../../../..')
const libpqOverrideKeys = ['PGHOST', 'PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGPORT']

function withoutLibpqOverrides(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const blocked = new Set<string>(libpqOverrideKeys)
  return Object.fromEntries(Object.entries(source).filter(([key]) => !blocked.has(key)))
}

function relayWithoutLibpqOverrides(): Promise<void> {
  const child = spawn(process.execPath, process.argv.slice(1), {
    env: withoutLibpqOverrides(process.env),
    stdio: 'inherit',
  })
  return new Promise((resolveRelay, rejectRelay) => {
    child.once('error', rejectRelay)
    child.once('exit', (code, signal) => {
      if (signal) {
        rejectRelay(new Error(`pruning proof stopped by ${signal}`))
        return
      }
      if (code) process.exitCode = code
      resolveRelay()
    })
  })
}

async function runPruningProof(): Promise<void> {
  const sourceUrl = process.env.DATABASE_URL
  if (!sourceUrl) throw new Error('DATABASE_URL must name a local source database')
  const connectionEnvironment = withoutLibpqOverrides(process.env)
  const runPsql = (file: string, args: string[]) => exec(file, args, { env: connectionEnvironment })

  const name = createPruningDatabaseName()
  const results: ExplainResult[] = []
  const retirementControls: string[] = []
  const lifecycleControls: string[] = []
  const migrationControls: string[] = []
  const migrationDatabases: string[] = []
  const lifecycleDatabases: string[] = []
  const evidence: Record<string, unknown> = {
    database: name,
    results,
    retirementControls,
    lifecycleControls,
    migrationControls,
    migrationDatabases,
    lifecycleDatabases,
  }
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
  const errors: unknown[] = []
  try {
    await assertMigrationRunnerControls(
      sourceUrl,
      connectionEnvironment,
      control => migrationControls.push(control),
      database => migrationDatabases.push(database),
    )
    if (migrationControls.length !== 2) throw new Error('Expected both native migration controls')
    await assertPruningDatabaseLifecycleControls(
      sourceUrl,
      connectionEnvironment,
      control => {
        lifecycleControls.push(control)
      },
      name => lifecycleDatabases.push(name),
    )
    if (lifecycleControls.length !== 3)
      throw new Error('Expected all three native lifecycle controls')
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
    const { shutdownDataStoresForOneOffCommand } = await import('@data-stores/graceful-shutdown')
    const { write, writePool, readPool, advisoryLockPool } = await import('@data-stores/psql')
    closePools = () =>
      shutdownDataStoresForOneOffCommand({
        onGracefulShutdownPSQL: async () => {
          const settled = await Promise.allSettled(
            [writePool, readPool, advisoryLockPool].map(pool =>
              Promise.resolve().then(() => pool.end()),
            ),
          )
          const failures = settled.flatMap(result =>
            result.status === 'rejected' ? [result.reason] : [],
          )
          if (failures.length)
            throw new AggregateError(failures, 'Pruning PostgreSQL pool closure failed', {
              cause: failures[0],
            })
        },
      })
    const { attachProofRanges } = await import('./partitions.mts')
    const { seedPruningProof, assertPruningFixturePlacement } = await import('./seed.mts')
    const { capturePruningProof } = await import('./capture.mts')
    const { assertMonthlyRetirementControls } = await import('./retirement-controls.mts')
    await assertMonthlyRetirementControls(owned.name, name => retirementControls.push(name))
    if (retirementControls.length !== 3)
      throw new Error('Expected all three native retirement controls')
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
  } catch (err) {
    errors.push(err)
    evidence.error = err instanceof Error ? err.message : stringFromUnknown(err)
  } finally {
    try {
      await mkdir(outputDirectory, { recursive: true })
      await writeFile(outputPath, JSON.stringify(evidence, null, 2))
      console.log(`Pruning proof artifact: ${outputPath}`)
    } catch (err) {
      errors.push(err)
    }
    try {
      await closePools?.()
    } catch (err) {
      errors.push(err)
    }
    try {
      await owned?.drop()
    } catch (err) {
      errors.push(err)
    }
    try {
      evidence.errors = errors.map(error =>
        error instanceof Error
          ? { name: error.name, message: error.message }
          : stringFromUnknown(error),
      )
      await writeFile(outputPath, JSON.stringify(evidence, null, 2))
    } catch (err) {
      errors.push(err)
    }
    process.off('SIGINT', interrupt)
    process.off('SIGTERM', interrupt)
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, 'Pruning proof and cleanup failed', { cause: errors[0] })
}

if (libpqOverrideKeys.some(key => process.env[key] !== undefined)) {
  await relayWithoutLibpqOverrides()
} else {
  await runPruningProof()
}
