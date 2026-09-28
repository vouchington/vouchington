import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  createOwnedPruningDatabase,
  createPruningDatabaseName,
  type OwnedPruningDatabase,
} from './database-lifecycle.mts'

const run = promisify(execFile)
function sourceUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL required for pruning lifecycle integration test')
  return url
}
async function exists(url: string, name: string): Promise<boolean> {
  const result = await run('psql', [
    '-X',
    '-d',
    url,
    '-Atqc',
    `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
  ])
  return result.stdout.trim() === '1'
}

describe('owned pruning database lifecycle', () => {
  it('refuses a nonlocal source or existing database', async () => {
    const name = createPruningDatabaseName()
    await expect(
      createOwnedPruningDatabase(run, 'postgres://remote.example/voucha', name, () => {}),
    ).rejects.toThrow(/local PostgreSQL/)
    await expect(
      createOwnedPruningDatabase(
        run,
        'postgres://localhost/voucha?hostaddr=198.51.100.2',
        name,
        () => {},
      ),
    ).rejects.toThrow(/local PostgreSQL/)
    let owned: OwnedPruningDatabase | undefined
    try {
      await createOwnedPruningDatabase(run, sourceUrl(), name, database => {
        owned = database
      })
      await expect(createOwnedPruningDatabase(run, sourceUrl(), name, () => {})).rejects.toThrow(
        /refusing existing/,
      )
      expect(await exists(sourceUrl(), name)).toBe(true)
    } finally {
      await owned?.drop()
    }
  })
  it('drops only its owned sibling after a failure', async () => {
    const name = createPruningDatabaseName()
    let owned: OwnedPruningDatabase | undefined
    try {
      await createOwnedPruningDatabase(run, sourceUrl(), name, database => {
        owned = database
      })
      expect(await exists(sourceUrl(), name)).toBe(true)
      throw new Error('injected fixture failure')
    } catch (error) {
      expect(error).toEqual(new Error('injected fixture failure'))
    } finally {
      await owned?.drop()
    }
    expect(await exists(sourceUrl(), name)).toBe(false)
  })
  it('recovers its exact owned name after an ambiguous create error', async () => {
    const name = createPruningDatabaseName()
    let owned: OwnedPruningDatabase | undefined
    const transportFailure = async (file: string, args: string[]) => {
      const result = await run(file, args)
      if (args.some(arg => arg.startsWith('CREATE DATABASE'))) {
        throw new Error('injected transport failure after create')
      }
      return result
    }
    try {
      await expect(
        createOwnedPruningDatabase(transportFailure, sourceUrl(), name, database => {
          owned = database
        }),
      ).rejects.toThrow(/transport failure/)
      expect(await exists(sourceUrl(), name)).toBe(true)
    } finally {
      await owned?.drop()
    }
    expect(await exists(sourceUrl(), name)).toBe(false)
  })
})
