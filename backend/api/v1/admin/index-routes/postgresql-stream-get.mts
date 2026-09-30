import { createChannelPubSub } from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'
import { getMigrationStatus } from '@services/psql-admin'
import { currentUserCanAccessPsqlAdmin } from '@services/psql-admin/authorization'
import app from '../../../app.mts'
import { createAdminSnapshotStream } from './snapshot-stream.mts'

const TICKER_INTERVAL_MS = 30_000

const postgresqlPubSub = createChannelPubSub<unknown>('admin:postgresql')

function publishPostgresqlSnapshot(publish: (value: unknown) => Promise<void>): void {
  getMigrationStatus()
    .then(snapshot => publish(snapshot))
    .catch(err => {
      const error = err instanceof Error ? err.message : 'Failed to load PostgreSQL status'
      void publish({ error }).catch(onError)
      onError(err instanceof Error ? err : new Error(String(err)))
    })
}

async function loadPostgresqlInitialValue(): Promise<unknown> {
  try {
    return await getMigrationStatus()
  } catch (err) /* v8 ignore next 2 -- exercising recovery requires a forbidden internal service failure mock */ {
    onError(err instanceof Error ? err : new Error(String(err)))
  }
}

app.route('/api/v1/admin/postgresql/stream').get(
  createAdminSnapshotStream({
    authorize: currentUserCanAccessPsqlAdmin,
    rateLimitKey: 'GET:/api/v1/admin/postgresql/stream',
    pubSub: postgresqlPubSub,
    tickerIntervalMs: TICKER_INTERVAL_MS,
    publishTick: publishPostgresqlSnapshot,
    loadInitialValue: loadPostgresqlInitialValue,
  }),
)
