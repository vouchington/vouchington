import { randomBytes } from 'node:crypto'
import {
  databaseUrlWithName,
  type CommandRunner,
} from '../benchmarks/topic-metrics/database-lifecycle.mts'

export interface OwnedPruningDatabase {
  name: string
  url: string
  drop: () => Promise<void>
}

export function createPruningDatabaseName(): string {
  return `voucha_pruning_${randomBytes(12).toString('hex')}`
}

export function assertLocalDatabaseUrl(sourceUrl: string): void {
  const parsed = new URL(sourceUrl)
  const connectionOverrides = ['host', 'hostaddr', 'service', 'dbname', 'port']
  if (
    (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') ||
    !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) ||
    connectionOverrides.some(key => parsed.searchParams.has(key))
  ) {
    throw new Error('pruning proof requires a local PostgreSQL source URL')
  }
}

export async function createOwnedPruningDatabase(
  run: CommandRunner,
  sourceUrl: string,
  name: string,
  onOwned: (database: OwnedPruningDatabase) => void,
): Promise<OwnedPruningDatabase> {
  assertLocalDatabaseUrl(sourceUrl)
  if (!/^voucha_pruning_[a-f0-9]{24}$/.test(name)) {
    throw new Error('pruning proof database name must be a generated owned name')
  }
  const sourceName = new URL(sourceUrl).pathname.slice(1)
  if (sourceName === name) throw new Error('pruning proof cannot replace its source database')
  const exists = await run('psql', [
    '-X',
    '-d',
    sourceUrl,
    '-Atqc',
    `SELECT 1 FROM pg_database WHERE datname = '${name}'`,
  ])
  if (exists.stdout.trim()) throw new Error(`refusing existing pruning database ${name}`)

  let dropped = false
  const owned: OwnedPruningDatabase = {
    name,
    url: databaseUrlWithName(sourceUrl, name),
    async drop() {
      if (dropped) return
      await run('psql', [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-d',
        sourceUrl,
        '-c',
        `DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`,
      ])
      dropped = true
    },
  }
  onOwned(owned)
  await run('psql', [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-d',
    sourceUrl,
    '-c',
    `CREATE DATABASE "${name}"`,
  ])
  return owned
}
