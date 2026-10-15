import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { performance } from 'node:perf_hooks'
import { promisify } from 'node:util'
import type { CommandRunner } from '../benchmarks/topic-metrics/database-lifecycle.mts'
import { assertLocalDatabaseUrl, type OwnedPruningDatabase } from './database-lifecycle.mts'

const exec = promisify(execFile)

export async function withPruningLifecycleDatabase(
  environment: NodeJS.ProcessEnv,
  operation: (
    run: CommandRunner,
    register: (database: OwnedPruningDatabase) => void,
  ) => Promise<void>,
  sourceUrl: string,
  name: string,
  recordReserved: (name: string) => void,
): Promise<void> {
  const deadline = performance.now() + 30_000
  assertLocalDatabaseUrl(sourceUrl)
  assert.match(name, /^voucha_pruning_[a-f0-9]{24}$/)
  let cleaning = false
  const run: CommandRunner = (file, args) => {
    // Reserve five seconds of the SAME control budget for DROP and its absence check.
    const remaining = Math.floor(deadline - (cleaning ? 0 : 5_000) - performance.now())
    if (remaining <= 0) throw new Error('Pruning lifecycle control deadline exhausted')
    assert.equal(file, 'psql', 'lifecycle controls execute only their psql boundary')
    const databaseIndex = args.indexOf('-d') + 1
    assert.ok(databaseIndex > 0 && args[databaseIndex], 'expected explicit psql database URL')
    const boundedArgs = [...args]
    boundedArgs[databaseIndex] = pruningLifecycleConnectionUrl(args[databaseIndex], remaining)
    // execFile rejects on timeout and awaits child close; no raced or detached command.
    return exec(file, boundedArgs, { env: environment, timeout: remaining })
  }
  let reserved = false
  let owned: OwnedPruningDatabase | undefined
  const errors: unknown[] = []
  try {
    assert.equal(await pruningDatabaseExists(run, sourceUrl, name), false)
    // Independent of the production onOwned callback; retained even if CREATE is ambiguous.
    reserved = true
    recordReserved(name)
    await operation(run, database => {
      assert.equal(database.name, name)
      owned = database
    })
  } catch (err) {
    errors.push(err)
  }
  if (!owned && errors.length === 0) {
    errors.push(new Error(`Pruning lifecycle control did not register ownership of ${name}`))
  }
  cleaning = true
  if (reserved) {
    try {
      if (owned) await owned.drop()
      else {
        // Only the independently reserved, previously absent generated name is recoverable.
        await run('psql', [
          '-X',
          '-v',
          'ON_ERROR_STOP=1',
          '-d',
          sourceUrl,
          '-c',
          `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
        ])
      }
    } catch (err) {
      errors.push(err)
    }
    try {
      assert.equal(await pruningDatabaseExists(run, sourceUrl, name), false)
    } catch (err) {
      errors.push(err)
    }
  }
  if (performance.now() >= deadline) {
    errors.push(new Error('Pruning lifecycle control and cleanup exceeded thirty seconds'))
  }
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) {
    throw new AggregateError(errors, 'pruning lifecycle operation and cleanup failed', {
      cause: errors[0],
    })
  }
}

export async function pruningDatabaseExists(
  run: CommandRunner,
  url: string,
  name: string,
): Promise<boolean> {
  const result = await run('psql', [
    '-X',
    '-d',
    url,
    '-Atqc',
    `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
  ])
  return result.stdout.trim() === '1'
}

export function pruningLifecycleConnectionUrl(sourceUrl: string, remaining: number): string {
  const url = new URL(sourceUrl)
  // In a libpq URI, a raw query '+' is literal, unlike URLSearchParams form parsing.
  url.search = url.search.replaceAll('+', '%2B')
  const options = url.searchParams.get('options') ?? ''
  url.searchParams.set('options', `${options} -c statement_timeout=${remaining}ms`)
  url.searchParams.set(
    'connect_timeout',
    String(Math.min(5, Math.max(1, Math.floor(remaining / 1000)))),
  )
  // libpq decodes URI percent escapes, not form-urlencoded '+' spaces.
  url.search = url.searchParams.toString().replaceAll('+', '%20')
  return url.toString()
}
