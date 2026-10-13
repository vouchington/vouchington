import { onGracefulShutdown as closePostgres } from '@data-stores/psql/shutdown'
import { onGracefulShutdown as closeValkey } from '@data-stores/valkey'

/** Closes native datastore resources after the consuming test file has settled its work. */
export async function closeTestDataStores(): Promise<void> {
  const results = await Promise.allSettled([
    Promise.resolve().then(closeValkey),
    Promise.resolve().then(closePostgres),
  ])
  const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
  if (errors.length === 1) throw errors[0]
  if (errors.length > 1) throw new AggregateError(errors, 'Test datastore cleanup failed')
}
