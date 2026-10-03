import { apiSseFrame } from '../../../response-contract.mts'
import { createChannelPubSub } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'
import { getMigrationStatus } from '@services/psql-admin'
import { currentUserCanAccessPsqlAdmin } from '@services/psql-admin/authorization'
import app from '../../../app.mts'
import { createAdminSnapshotStream } from './snapshot-stream.mts'

const TICKER_INTERVAL_MS = 30_000

type PostgresqlSnapshot = Awaited<ReturnType<typeof getMigrationStatus>> | { error: string }

const postgresqlPubSub = createChannelPubSub<PostgresqlSnapshot>('admin:postgresql')

function publishPostgresqlSnapshot(publish: (value: PostgresqlSnapshot) => Promise<void>): void {
  getMigrationStatus()
    .then(snapshot => publish(snapshot))
    .catch(err => {
      const error = err instanceof Error ? err.message : 'Failed to load PostgreSQL status'
      void publish({ error }).catch(onError)
      onError(err instanceof Error ? err : new Error(String(err)))
    })
}

async function loadPostgresqlInitialValue(): Promise<PostgresqlSnapshot | undefined> {
  try {
    return await getMigrationStatus()
  } catch (err) /* v8 ignore next 2 -- exercising recovery requires a forbidden internal service failure mock */ {
    onError(err instanceof Error ? err : new Error(String(err)))
    return undefined
  }
}

app.route('/api/v1/admin/postgresql/stream').get(
  createAdminSnapshotStream({
    emit: (stream, event) =>
      stream.write(apiSseFrame('GET:/api/v1/admin/postgresql/stream', event)),
    authorize: currentUserCanAccessPsqlAdmin,
    rateLimitKey: 'GET:/api/v1/admin/postgresql/stream',
    pubSub: postgresqlPubSub,
    tickerIntervalMs: TICKER_INTERVAL_MS,
    publishTick: publishPostgresqlSnapshot,
    loadInitialValue: loadPostgresqlInitialValue,
  }),
)
