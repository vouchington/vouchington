import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { onTestFinished } from 'vitest'
import type { RunViewsOptions } from '@data-stores/psql/migrate'

/** The real entry may initialize parsers, but even an unapplied mock cannot execute view SQL. */
export async function createMigrationInitializationFixture() {
  const acquired = Promise.withResolvers<string | undefined>()
  onTestFinished(async () => {
    const directory = await acquired.promise
    if (directory) await rm(directory, { recursive: true, force: true })
  })
  try {
    const directory = await mkdtemp(join(tmpdir(), 'voucha-migration-initialization-'))
    acquired.resolve(directory)
    let sqlAttempts = 0
    const options: RunViewsOptions = {
      forced: true,
      folder: directory,
      writer: async () => {
        sqlAttempts += 1
        throw new Error('Initializer failure control must not execute SQL')
      },
    }
    return {
      options,
      get sqlAttempts() {
        return sqlAttempts
      },
    }
  } catch (err) {
    acquired.resolve(undefined)
    throw err
  }
}
