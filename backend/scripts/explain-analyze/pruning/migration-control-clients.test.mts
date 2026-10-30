import { describe, expect, it } from 'vitest'
import { assertMigrationServerClientsClosed } from './migration-control-clients.mts'

const ownedDatabase = `voucha_pruning_${'a'.repeat(24)}`
const migrationServerClientSampleMs = 200

function activity(backendType: string, pid = 42) {
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

function closed(input: {
  databaseName?: string
  controlDeadline: number
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
  run: (file: string, args: string[]) => Promise<{ stdout: string }>
}) {
  let now = 0
  return assertMigrationServerClientsClosed({
    databaseName: input.databaseName ?? ownedDatabase,
    sourceUrl: 'postgres://postgres@127.0.0.1/postgres',
    now: input.now ?? (() => now),
    controlDeadline: input.controlDeadline,
    sleep: input.sleep,
    run: input.run,
  })
}

describe('migration server clients', () => {
  it.each([
    { disappears: false, expected: 'Owned database still has server clients: pid=42' },
    { disappears: true, expected: 'closed' },
  ])(
    'preserves launch headroom with a clipped budget when disappears=$disappears',
    async ({ disappears, expected }) => {
      let now = 0
      let reads = 0
      const sleeps: number[] = []
      const controlDeadline = 12_405
      const result = closed({
        controlDeadline,
        now: () => now,
        sleep: async milliseconds => {
          sleeps.push(milliseconds)
          now += milliseconds + 1
        },
        run: async () => {
          now += 1
          const seconds = Math.floor((controlDeadline - now - 10_000 - 500) / 1000)
          if (seconds < 1) throw new Error('Insufficient migration control budget')
          now += 100
          reads += 1
          return {
            stdout: JSON.stringify(disappears && reads > 1 ? [] : [activity('client backend')]),
          }
        },
      })
      const outcome = await result.then(
        () => 'closed',
        (err: unknown) => {
          if (!(err instanceof Error)) throw err
          return err.message
        },
      )
      expect(outcome).toContain(expected)
      expect(reads).toBeGreaterThan(1)
      expect(sleeps).toEqual([migrationServerClientSampleMs])
    },
  )

  it('accepts an autovacuum-only activity sample', async () => {
    const queries: string[] = []
    await closed({
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
    const sql = queries[0] ?? ''
    expect(sql).toContain('/* assertMigrationControlClientsClosed */')
    expect(sql).toContain(`datname = '${ownedDatabase}'`)
    expect(sql).not.toContain('count(*)')
  })

  it('rejects a database name outside the owned pruning pattern', async () => {
    await expect(
      closed({
        databaseName: 'postgres',
        controlDeadline: 11_500,
        run: async () => {
          throw new Error('should not query')
        },
      }),
    ).rejects.toThrow(/voucha_pruning_/)
  })

  it('keeps a client backend and a parallel worker and drops autovacuum', async () => {
    const outcome = await closed({
      controlDeadline: 11_500,
      sleep: async () => {
        throw new Error('sleep past the deadline')
      },
      run: async () => ({
        stdout: JSON.stringify([
          activity('autovacuum worker'),
          activity('client backend', 7),
          activity('parallel worker', 8),
        ]),
      }),
    }).then(
      () => 'closed',
      (err: unknown) => {
        if (!(err instanceof Error)) throw err
        return err.message
      },
    )
    expect(outcome).toContain('pid=7')
    expect(outcome).toContain('backend_type=client backend')
    expect(outcome).toContain('pid=8')
    expect(outcome).toContain('backend_type=parallel worker')
    expect(outcome).not.toContain('autovacuum')
  })

  it('parses activity json from the control query', async () => {
    const client = activity('client backend', 9)
    const outcome = await closed({
      controlDeadline: 11_500,
      sleep: async () => {
        throw new Error('sleep past the deadline')
      },
      run: async () => ({ stdout: JSON.stringify([client]) }),
    }).then(
      () => 'closed',
      (err: unknown) => {
        if (!(err instanceof Error)) throw err
        return err.message
      },
    )
    expect(outcome).toContain('pid=9')
    expect(outcome).toContain('backend_type=client backend')
    expect(outcome).toContain('state=idle')
    expect(outcome).toContain('wait_event=Client.ClientRead')
    expect(outcome).toContain('application_name=')
    expect(outcome).toContain('query=SELECT 1')

    await closed({
      controlDeadline: 11_500,
      run: async () => ({ stdout: '[]' }),
    })
  })

  it('waits out a backend that disappears and still reports one that stays', async () => {
    let now = 0
    const disappearing = [JSON.stringify([activity('client backend')]), '[]']
    const sleeps: number[] = []
    await closed({
      controlDeadline: 12_400,
      now: () => now,
      sleep: async milliseconds => {
        sleeps.push(milliseconds)
        now += milliseconds
      },
      run: async () => {
        const stdout = disappearing.shift()
        if (stdout === undefined) throw new Error('unexpected extra read')
        return { stdout }
      },
    })
    expect(sleeps).toEqual([migrationServerClientSampleMs])

    now = 0
    const stayed = await closed({
      controlDeadline: 11_500,
      now: () => now,
      sleep: async () => {
        throw new Error('sleep past the deadline')
      },
      run: async () => ({ stdout: JSON.stringify([activity('client backend', 11)]) }),
    }).then(
      () => 'closed',
      (err: unknown) => {
        if (!(err instanceof Error)) throw err
        return err.message
      },
    )
    expect(stayed).toContain('pid=11')
    expect(stayed).toContain('backend_type=client backend')
  })
})
