import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import { diagnoseValkey } from '@services/valkey-admin/diagnostics'
import { flushConcern } from '@services/valkey-admin/flush'
import { createFlushTargetPrefixRegistry } from '@services/valkey-admin/flush-targets'
import { flushQueues, getQueueFlushTargetPrefixes } from '@voucha/api/v1/valkey/queues-flush'
import type { ValkeyAdminRuntime } from './valkey-admin-command.mts'

export function createValkeyAdminRuntime(): ValkeyAdminRuntime {
  const registry = createFlushTargetPrefixRegistry(getQueueFlushTargetPrefixes())
  return {
    diagnose: signal => {
      signal.throwIfAborted()
      return diagnoseValkey(registry, signal)
    },
    flushConcern: (concern, opts) => {
      opts.signal.throwIfAborted()
      return flushConcern(concern, opts)
    },
    flushQueues: signal => {
      signal.throwIfAborted()
      return flushQueues(signal)
    },
    shutdown: shutdownDataStoresForOneOffCommand,
  }
}
