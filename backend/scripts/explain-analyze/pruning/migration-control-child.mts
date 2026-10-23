import assert from 'node:assert/strict'
import { observeMigrationPools } from './migration-control-pools.mts'
import { createMigrationControlJournal } from './migration-control-journal.mts'

// The parent supplies only its independently registered sibling before the first app import.
const [role, name, expectedOid, evidencePath] = process.argv.slice(2)
assert.equal(role, 'concurrent')
assert.ok(name && /^voucha_pruning_[a-f0-9]{24}$/.test(name))
assert.ok(evidencePath)
const oid = Number(expectedOid)
assert.ok(Number.isSafeInteger(oid) && oid > 0)
assert.equal(new URL(process.env.DATABASE_URL ?? '').pathname, `/${name}`)
assert.equal(process.env.READ_DATABASE_URL, process.env.DATABASE_URL)
const record = await createMigrationControlJournal(role, name, oid, evidencePath)
const errors: unknown[] = []
let phase = 'before-import'
let failedPhase: string | undefined
const checkpoint = async (next: string) => {
  phase = next
  await record(phase, 'running')
}
let closeCanonical: ReturnType<typeof observeMigrationPools> | undefined
let closeAlternate: ReturnType<typeof observeMigrationPools> | undefined
let shutdown:
  | typeof import('@data-stores/graceful-shutdown').shutdownDataStoresForOneOffCommand
  | undefined
let observedClients = 0
let canonicalClosed = false
let alternateClosed: boolean | null = null
try {
  await checkpoint('application-import')
  const { psql } = await import('@data-stores/psql/setup')
  closeCanonical = observeMigrationPools(psql)
  const { applyAllMigrations } = await import('@data-stores/psql/migrate')
  shutdown = (await import('@data-stores/graceful-shutdown')).shutdownDataStoresForOneOffCommand
  await checkpoint('database-identity')
  const { rows } = await psql.read<{ name: string; oid: number }>(
    '/* assertMigrationControlDatabase */ SELECT datname AS name, oid::integer AS oid FROM pg_database WHERE datname = current_database()',
  )
  assert.equal(rows[0]?.name, name)
  assert.equal(rows[0]?.oid, oid)
  await checkpoint('canonical-bootstrap')
  await applyAllMigrations()
  await checkpoint('alternate-platform-startup')
  alternateClosed = false
  const { createPsql } = await import('@vouchington/postgres')
  const alternate = await createPsql({
    connectionString: process.env.DATABASE_URL ?? '',
    readConnectionString: process.env.READ_DATABASE_URL,
    databaseName: 'voucha',
    migrationExtensions: ['vector', 'pgcrypto', 'pg_trgm', 'pg_stat_statements', 'unaccent'],
    errorHandler: error => {
      errors.push(error)
    },
  })
  closeAlternate = observeMigrationPools(alternate)
  await checkpoint('concurrent-application-runners')
  const { assertSerializedMigrationRunner } = await import('./migration-runner-fixture.mts')
  await assertSerializedMigrationRunner(alternate)
} catch (err) {
  errors.push(err)
  failedPhase = phase
  try {
    await record('execution-failure', 'failed', { failedPhase })
  } catch (err) {
    errors.push(err)
  }
} finally {
  // A missing observer after failed SDK startup is NOT a complete physical-close proof.
  try {
    await record('pool-teardown', 'closing', { canonicalClosed, alternateClosed, failedPhase })
  } catch (err) {
    errors.push(err)
  }
  if (closeAlternate) {
    try {
      observedClients += await closeAlternate()
      alternateClosed = true
    } catch (err) {
      errors.push(err)
    }
  }
  if (closeCanonical) {
    const close = closeCanonical
    const end = async () => {
      observedClients += await close()
      canonicalClosed = true
    }
    try {
      if (shutdown) await shutdown({ onGracefulShutdownPSQL: end })
      else await end()
    } catch (err) {
      errors.push(err)
    }
  }
  try {
    await record('teardown-result', errors.length ? 'failed' : 'closed', {
      canonicalClosed,
      alternateClosed,
      observedClients,
      failedPhase,
      // Raw API rejection objects remain in errors; no credential-bearing messages in receipts.
      failures: errors.map(error => ({ type: error instanceof Error ? 'Error' : typeof error })),
    })
  } catch (err) {
    errors.push(err)
  }
}
if (errors.length === 1) throw errors[0]
if (errors.length > 1)
  throw new AggregateError(errors, 'Migration native control failed', { cause: errors[0] })
