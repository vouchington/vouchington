import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { promisify } from 'node:util'
import type { CommandRunner } from '../benchmarks/topic-metrics/database-lifecycle.mts'
import { createOwnedPruningDatabase, createPruningDatabaseName } from './database-lifecycle.mts'
import {
  pruningDatabaseExists,
  pruningLifecycleConnectionUrl,
} from './database-lifecycle-scope.mts'
import { migrationCommandFailure } from './migration-command-failure.mts'
import { assertMigrationServerClientsClosed } from './migration-control-clients.mts'
import {
  launchMigrationControlChild,
  readMigrationChildIdentity,
  migrationChildGroupMembers,
  recordMigrationChildFailure,
} from './migration-control-process.mts'

const exec = promisify(execFile)
const root = resolve(import.meta.dirname, '../../../..')
const wrapper = join(root, 'ci/run-bounded.py')

export async function withOwnedMigrationControl(
  role: 'package' | 'concurrent',
  sourceUrl: string,
  environment: NodeJS.ProcessEnv,
  recordReserved: (name: string) => void,
): Promise<void> {
  const deadline = performance.now() + 30_000
  const name = createPruningDatabaseName()
  const errors: unknown[] = []
  let reserved = false
  let closedChild = false
  let cleaning = false
  let directory: string | undefined
  let ownedOid: number | undefined
  let commandFailure = 0
  let evidencePath: string | undefined
  let childCommandRegistered = false
  const commandError = (error: unknown, message: string) =>
    migrationCommandFailure(error, message, directory, ++commandFailure)
  // Each launcher includes the canonical wrapper's ten-second TERM allowance in this same clock.
  const bounded = async (file: string, args: string[]) => {
    const remaining = Math.floor(deadline - performance.now())
    const seconds = Math.floor((remaining - 10_000 - 500 - (cleaning ? 0 : 12_000)) / 1000)
    assert.ok(seconds >= 1, 'Insufficient migration control budget; retain owned sibling')
    try {
      return await exec('python3', [wrapper, String(seconds), file, ...args], {
        cwd: root,
        env: environment,
        maxBuffer: 8 * 1024 * 1024,
      })
    } catch (err) {
      throw await commandError(
        err,
        'Bounded migration command failed; physical closure is not certified',
      )
    }
  }
  const run: CommandRunner = (file, args) => {
    assert.equal(file, 'psql')
    const copy = [...args]
    const index = copy.indexOf('-d') + 1
    assert.ok(index > 0 && copy[index])
    copy[index] = pruningLifecycleConnectionUrl(
      copy[index],
      Math.max(1, deadline - performance.now() - (cleaning ? 0 : 12_000)),
    )
    return bounded(file, copy)
  }
  try {
    directory = await mkdtemp(join(tmpdir(), 'voucha-native-migration-'))
    assert.equal(await pruningDatabaseExists(run, sourceUrl, name), false)
    reserved = true
    recordReserved(name)
    const owned = await createOwnedPruningDatabase(run, sourceUrl, name, database => {
      assert.equal(database.name, name)
    })
    const identity = await run('psql', [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-d',
      sourceUrl,
      '-Atqc',
      `/* identifyOwnedMigrationDatabase */ SELECT oid FROM pg_database WHERE datname = '${name}'`,
    ])
    const oid = Number(identity.stdout.trim())
    assert.ok(Number.isSafeInteger(oid) && oid > 0, 'Expected actual owned database OID')
    ownedOid = oid
    evidencePath = join(directory, 'child.json')
    // Keep normal Node flags/coverage and SDK suppliers; only the generated sibling URL changes.
    const remaining = Math.floor(deadline - performance.now())
    const seconds = Math.floor((remaining - 10_000 - 12_000 - 500) / 1000)
    assert.ok(seconds >= 1, 'Insufficient migration child budget; retain owned sibling')
    childCommandRegistered = true
    await launchMigrationControlChild(
      seconds,
      { role, name, oid },
      owned.url,
      evidencePath,
      environment,
    ).catch(async err => {
      throw await commandError(
        err,
        'Owned migration child failed; sibling and private evidence retained',
      )
    })
    const childIdentity = await readMigrationChildIdentity(evidencePath, { role, name, oid }, true)
    cleaning = true
    assert.deepEqual(
      await migrationChildGroupMembers(bounded, childIdentity),
      [],
      'Owned child process group still has members',
    )
    closedChild = true
  } catch (err) {
    errors.push(err)
  }
  cleaning = true
  if (errors.length && childCommandRegistered && evidencePath && directory) {
    try {
      assert.ok(ownedOid !== undefined)
      await recordMigrationChildFailure(bounded, evidencePath, directory, {
        role,
        name,
        oid: ownedOid,
      })
    } catch (err) {
      errors.push(err)
    }
  }
  // No root/stream/group proof => retain the independently recorded sibling, even on failure.
  if (reserved && closedChild) {
    try {
      // The child process group is already empty. PostgreSQL can still list that child's
      // backend until the server reaps it. A client that remains is a leaked session.
      await assertMigrationServerClientsClosed({
        run,
        databaseName: name,
        sourceUrl,
        now: () => performance.now(),
        controlDeadline: deadline,
      })
      const identity = await run('psql', [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-d',
        sourceUrl,
        '-Atqc',
        `/* recheckOwnedMigrationDatabase */ SELECT oid FROM pg_database WHERE datname = '${name}'`,
      ])
      assert.equal(Number(identity.stdout.trim()), ownedOid, 'Owned database identity changed')
      await run('psql', [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-d',
        sourceUrl,
        '-c',
        `DROP DATABASE "${name}"`,
      ])
      assert.equal(await pruningDatabaseExists(run, sourceUrl, name), false)
    } catch (err) {
      errors.push(err)
    }
  }
  // Failed controls retain their child evidence alongside the separately registered sibling.
  if (directory && errors.length === 0) {
    try {
      await rm(directory, { recursive: true, force: true })
    } catch (err) {
      errors.push(err)
    }
  }
  if (performance.now() >= deadline)
    errors.push(new Error('Migration control exceeded thirty seconds'))
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      'Migration control and cleanup failed; inspect reserved siblings',
      { cause: errors[0] },
    )
}
