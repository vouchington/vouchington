import assert from 'node:assert/strict'
import type { CommandRunner } from '../benchmarks/topic-metrics/database-lifecycle.mts'
import { createOwnedPruningDatabase, createPruningDatabaseName } from './database-lifecycle.mts'
import {
  pruningDatabaseExists as exists,
  withPruningLifecycleDatabase,
} from './database-lifecycle-scope.mts'

// These are server-state controls, deliberately outside Vitest and its shared database.
export async function assertPruningDatabaseLifecycleControls(
  sourceUrl: string,
  environment: NodeJS.ProcessEnv,
  record: (name: string) => void,
  recordReserved: (name: string) => void,
): Promise<void> {
  {
    const name = createPruningDatabaseName()
    await withPruningLifecycleDatabase(
      environment,
      async (run, register) => {
        for (const url of [
          'postgres://remote.example/voucha',
          'postgres://localhost/voucha?hostaddr=198.51.100.2',
        ]) {
          await assert.rejects(
            createOwnedPruningDatabase(run, url, name, () => {}),
            /local PostgreSQL/,
          )
        }
        await createOwnedPruningDatabase(run, sourceUrl, name, register)
        assert.equal(await exists(run, sourceUrl, name), true)
        await assert.rejects(
          createOwnedPruningDatabase(run, sourceUrl, name, () => {}),
          error =>
            error instanceof Error &&
            error.message === `refusing existing pruning database ${name}`,
        )
      },
      sourceUrl,
      name,
      recordReserved,
    )
    record('refuses a nonlocal source or existing database')
  }
  {
    const name = createPruningDatabaseName()
    const failure = new Error('injected fixture failure')
    await assert.rejects(
      withPruningLifecycleDatabase(
        environment,
        async (run, register) => {
          await createOwnedPruningDatabase(run, sourceUrl, name, register)
          assert.equal(await exists(run, sourceUrl, name), true)
          throw failure
        },
        sourceUrl,
        name,
        recordReserved,
      ),
      error => error === failure,
    )
    record('drops only its owned sibling after a failure')
  }
  {
    const name = createPruningDatabaseName()
    const failure = new Error('injected transport failure after create')
    await withPruningLifecycleDatabase(
      environment,
      async (run, register) => {
        const transportFailure: CommandRunner = async (file, args) => {
          const result = await run(file, args)
          if (args.some(arg => arg.startsWith('CREATE DATABASE'))) throw failure
          return result
        }
        await assert.rejects(
          createOwnedPruningDatabase(transportFailure, sourceUrl, name, register),
          error => error === failure,
        )
        assert.equal(await exists(run, sourceUrl, name), true)
      },
      sourceUrl,
      name,
      recordReserved,
    )
    record('recovers its exact owned name after an ambiguous create error')
  }
}
