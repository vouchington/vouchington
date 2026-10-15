import { describe, expect, it } from 'vitest'
import type { CommandRunner } from '../benchmarks/topic-metrics/database-lifecycle.mts'
import {
  createOwnedPruningDatabase,
  createPruningDatabaseName,
  type OwnedPruningDatabase,
} from './database-lifecycle.mts'

const sourceUrl = 'postgres://localhost/pruning_source'

// This boundary records commands; real database-state assertions live in the required CLI.
describe('owned pruning database lifecycle', () => {
  it('refuses a nonlocal source or existing database', async () => {
    const commands: string[][] = []
    const run: CommandRunner = (_file, args) => {
      commands.push(args)
      return Promise.resolve({ stdout: '1\n' })
    }
    const name = createPruningDatabaseName()
    for (const url of [
      'postgres://remote.example/voucha',
      'postgres://localhost/voucha?hostaddr=198.51.100.2',
    ]) {
      await expect(createOwnedPruningDatabase(run, url, name, () => {})).rejects.toThrow(
        /local PostgreSQL/,
      )
    }
    expect(commands).toEqual([])
    const ownership: OwnedPruningDatabase[] = []
    await expect(
      createOwnedPruningDatabase(run, sourceUrl, name, owned => ownership.push(owned)),
    ).rejects.toThrow(`refusing existing pruning database ${name}`)
    expect(ownership).toEqual([])
    expect(commands).toEqual([
      ['-X', '-d', sourceUrl, '-Atqc', `SELECT 1 FROM pg_database WHERE datname = '${name}'`],
    ])
  })

  it('drops only its owned sibling after a failure', async () => {
    const commands: Array<{ file: string; args: string[] }> = []
    const run: CommandRunner = (file, args) => {
      commands.push({ file, args })
      return Promise.resolve({ stdout: '' })
    }
    const name = createPruningDatabaseName()
    let owned: OwnedPruningDatabase | undefined
    const failure = new Error('injected fixture failure')
    const operation = async () => {
      try {
        const database = await createOwnedPruningDatabase(run, sourceUrl, name, value => {
          owned = value
        })
        expect(database).toBe(owned)
        expect(database.name).toBe(name)
        expect(database.url).toBe(`postgres://localhost/${name}`)
        throw failure
      } finally {
        await owned?.drop()
        await owned?.drop()
      }
    }
    await expect(operation()).rejects.toBe(failure)
    expect(commands).toEqual([
      {
        file: 'psql',
        args: [
          '-X',
          '-d',
          sourceUrl,
          '-Atqc',
          `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
        ],
      },
      {
        file: 'psql',
        args: ['-X', '-v', 'ON_ERROR_STOP=1', '-d', sourceUrl, '-c', `CREATE DATABASE "${name}"`],
      },
      {
        file: 'psql',
        args: [
          '-X',
          '-v',
          'ON_ERROR_STOP=1',
          '-d',
          sourceUrl,
          '-c',
          `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
        ],
      },
    ])
  })

  it('recovers its exact owned name after an ambiguous create error', async () => {
    const name = createPruningDatabaseName()
    const failure = new Error('injected transport failure after create')
    let owned: OwnedPruningDatabase | undefined
    const commands: string[] = []
    const ownershipAtCreate: Array<string | undefined> = []
    const run: CommandRunner = (_file, args) => {
      const sql = args.at(-1) ?? ''
      commands.push(sql)
      if (sql.startsWith('CREATE DATABASE')) {
        ownershipAtCreate.push(owned?.name)
        return Promise.reject(failure)
      }
      return Promise.resolve({ stdout: '' })
    }
    try {
      await expect(
        createOwnedPruningDatabase(run, sourceUrl, name, value => {
          owned = value
        }),
      ).rejects.toBe(failure)
    } finally {
      await owned?.drop()
    }
    expect(ownershipAtCreate).toEqual([name])
    expect(commands).toEqual([
      `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
      `CREATE DATABASE "${name}"`,
      `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
    ])
  })
})
