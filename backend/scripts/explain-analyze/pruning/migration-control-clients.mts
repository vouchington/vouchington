import assert from 'node:assert/strict'

const pruningDatabaseName = /^voucha_pruning_[a-f0-9]{24}$/
const serverClientBackendTypes = ['client backend', 'parallel worker'] as const

/** How long an already-exited child's backend may remain visible, inside the control budget. */
export const migrationServerClientSettleMs = 2_000
export const migrationServerClientSampleMs = 200

export interface MigrationActivityRow {
  pid: number
  backendType: string
  state: string | null
  waitEventType: string | null
  waitEvent: string | null
  applicationName: string | null
  query: string | null
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new TypeError(`Expected ${field} to be a string`)
  return value
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null
  return requiredString(value, field)
}

/** Server clients are sessions the migration child owned. Autovacuum is not one of them. */
export function migrationServerClients<Row extends { backendType: string }>(
  rows: readonly Row[],
): Row[] {
  return rows.filter(row =>
    (serverClientBackendTypes as readonly string[]).includes(row.backendType),
  )
}

export function migrationServerClientActivitySql(databaseName: string): string {
  assert.match(databaseName, pruningDatabaseName)
  const types = serverClientBackendTypes.map(type => `'${type}'`).join(', ')
  return [
    '/* assertMigrationControlClientsClosed */',
    'SELECT coalesce(json_agg(json_build_object(',
    "'pid', pid,",
    "'backendType', backend_type,",
    "'state', state,",
    "'waitEventType', wait_event_type,",
    "'waitEvent', wait_event,",
    "'applicationName', application_name,",
    "'query', left(query, 200)",
    `)) FILTER (WHERE backend_type IN (${types})), '[]'::json)::text`,
    'FROM pg_stat_activity',
    `WHERE datname = '${databaseName}'`,
  ].join(' ')
}

export function parseMigrationActivity(payload: string): MigrationActivityRow[] {
  const parsed: unknown = JSON.parse(payload)
  assert.ok(Array.isArray(parsed), 'Expected migration activity JSON array')
  return parsed.map(row => {
    assert.ok(typeof row === 'object' && row !== null, 'Expected migration activity row')
    const record = Object.fromEntries(Object.entries(row))
    const pid = record.pid
    assert.ok(
      typeof pid === 'number' && Number.isSafeInteger(pid) && pid > 0,
      'Expected migration activity pid',
    )
    return {
      pid,
      backendType: requiredString(record.backendType, 'backendType'),
      state: nullableString(record.state, 'state'),
      waitEventType: nullableString(record.waitEventType, 'waitEventType'),
      waitEvent: nullableString(record.waitEvent, 'waitEvent'),
      applicationName: nullableString(record.applicationName, 'applicationName'),
      query: nullableString(record.query, 'query'),
    }
  })
}

/**
 * Re-read until no server client remains or the deadline arrives.
 * A backend that stays is still a failure. The caller owns the deadline.
 */
export async function readSettledMigrationServerClients(input: {
  read: () => Promise<readonly MigrationActivityRow[]>
  now: () => number
  deadline: number
  sleep: (milliseconds: number) => Promise<void>
}): Promise<readonly MigrationActivityRow[]> {
  let clients = await input.read()
  while (clients.length > 0 && input.now() + migrationServerClientSampleMs <= input.deadline) {
    await input.sleep(migrationServerClientSampleMs)
    clients = await input.read()
  }
  return clients
}

export function formatMigrationServerClients(clients: readonly MigrationActivityRow[]): string {
  return clients
    .map(
      client =>
        `pid=${client.pid} backend_type=${client.backendType} state=${client.state ?? ''} wait_event=${client.waitEventType ?? ''}.${client.waitEvent ?? ''} application_name=${client.applicationName ?? ''} query=${client.query ?? ''}`,
    )
    .join('; ')
}

/** Parent psql budget: ten-second termination reserve, half-second margin, and one whole second. */
const migrationCommandReserveMs = 11_500
// Stop before the minimum launch boundary so timer drift and setup cannot consume it.
const migrationCommandLaunchHeadroomMs = 500

export async function assertMigrationServerClientsClosed(input: {
  run: (file: string, args: string[]) => Promise<{ stdout: string }>
  databaseName: string
  sourceUrl: string
  now: () => number
  controlDeadline: number
  sleep?: (milliseconds: number) => Promise<void>
}): Promise<void> {
  const clients = await readSettledMigrationServerClients({
    now: input.now,
    deadline: Math.min(
      input.now() + migrationServerClientSettleMs,
      input.controlDeadline - migrationCommandReserveMs - migrationCommandLaunchHeadroomMs,
    ),
    sleep:
      input.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))),
    read: async () => {
      const activity = await input.run('psql', [
        '-X',
        '-v',
        'ON_ERROR_STOP=1',
        '-d',
        input.sourceUrl,
        '-Atqc',
        migrationServerClientActivitySql(input.databaseName),
      ])
      return migrationServerClients(parseMigrationActivity(activity.stdout.trim()))
    },
  })
  assert.equal(
    clients.length,
    0,
    `Owned database still has server clients: ${formatMigrationServerClients(clients)}`,
  )
}
