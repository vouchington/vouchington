import { describe, expect, it } from 'vitest'
import {
  assertMigrationServerClientsClosed,
  formatMigrationServerClients,
  migrationServerClientActivitySql,
  migrationServerClientSampleMs,
  migrationServerClients,
  parseMigrationActivity,
  readSettledMigrationServerClients,
  type MigrationActivityRow,
} from './migration-control-clients.mts'

const ownedDatabase = `voucha_pruning_${'a'.repeat(24)}`

function activity(backendType: string, pid = 42): MigrationActivityRow {
  return {
    pid,
    backendType,
    state: backendType === 'client backend' ? 'idle' : null,
    waitEventType: backendType === 'client backend' ? 'Client' : 'Timeout',
    waitEvent: backendType === 'client backend' ? 'ClientRead' : 'VacuumDelay',
    applicationName: '',
    query:
      backendType === 'autovacuum worker' ? 'autovacuum: VACUUM ANALYZE migrations' : 'SELECT 1',
  }
}

describe('migration server clients', () => {
  it('accepts an autovacuum-only activity sample', async () => {
    const queries: string[] = []
    await assertMigrationServerClientsClosed({
      databaseName: ownedDatabase,
      sourceUrl: 'postgres://postgres@127.0.0.1/postgres',
      now: () => 0,
      controlDeadline: 11_500,
      sleep: async () => {
        throw new Error('autovacuum is not a server client')
      },
      run: async (_file, args) => {
        queries.push(args.at(-1) ?? '')
        return { stdout: JSON.stringify([activity('autovacuum worker')]) }
      },
    })
    expect(queries).toEqual([
      expect.stringContaining("backend_type IN ('client backend', 'parallel worker')"),
    ])
  })

  it('does not treat an autovacuum worker as a server client', () => {
    expect(migrationServerClients([activity('autovacuum worker')])).toEqual([])
  })

  it('keeps a client backend and a parallel worker', () => {
    const client = activity('client backend', 7)
    const worker = activity('parallel worker', 8)
    expect(migrationServerClients([activity('autovacuum worker'), client, worker])).toEqual([
      client,
      worker,
    ])
  })

  it('selects client backends and their parallel workers', () => {
    const sql = migrationServerClientActivitySql(ownedDatabase)
    expect(sql).toContain('/* assertMigrationControlClientsClosed */')
    expect(sql).toContain(`datname = '${ownedDatabase}'`)
    expect(sql).toContain("backend_type IN ('client backend', 'parallel worker')")
    expect(sql).not.toContain('count(*)')
    expect(() => migrationServerClientActivitySql('postgres')).toThrow(/voucha_pruning_/)
  })

  it('parses activity json from the control query', () => {
    const client = activity('client backend', 9)
    expect(parseMigrationActivity(JSON.stringify([client]))).toEqual([client])
    expect(parseMigrationActivity('[]')).toEqual([])
  })

  it('waits out a backend that disappears and still reports one that stays', async () => {
    let now = 0
    const disappearing = [[activity('client backend')], [], []]
    const sleeps: number[] = []
    const settled = await readSettledMigrationServerClients({
      read: async () => disappearing.shift() ?? [],
      now: () => now,
      deadline: 500,
      sleep: async milliseconds => {
        sleeps.push(milliseconds)
        now += milliseconds
      },
    })
    expect(settled).toEqual([])
    expect(sleeps).toEqual([migrationServerClientSampleMs])

    now = 0
    const stayed = activity('client backend', 11)
    const remaining = await readSettledMigrationServerClients({
      read: async () => [stayed],
      now: () => now,
      deadline: 0,
      sleep: async () => {
        throw new Error('sleep past the deadline')
      },
    })
    expect(remaining).toEqual([stayed])
    expect(formatMigrationServerClients(remaining)).toContain('pid=11')
    expect(formatMigrationServerClients(remaining)).toContain('backend_type=client backend')
  })
})
