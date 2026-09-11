import { flush as flushLocal } from './backend-local.mts'
import { flush as flushFirehose } from './backend-firehose.mts'
import { closeConnection } from './query.mts'
import onError from '@modules/on-error'
import { addGracefulShutdownCallback } from '@data-stores/graceful-shutdown'
import { parseAnalyticsBackend } from './config.mts'

export async function onGracefulShutdown(): Promise<void> {
  // Read at call time so env changes after module load are reflected.
  const backend = parseAnalyticsBackend(process.env.ANALYTICS_BACKEND ?? 'disabled')
  if (backend === 'local') {
    await flushLocal().catch(onError)
    await closeConnection().catch(onError)
    return
  }

  if (backend === 'firehose') {
    await flushFirehose().catch(onError)
  }
}

// Self-register so any process importing @data-stores/analytics gets the flush on exit.
addGracefulShutdownCallback(onGracefulShutdown)
