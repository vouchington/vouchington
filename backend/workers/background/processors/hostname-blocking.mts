import {
  enqueueHostnameBlockRecovery,
  enqueueOrReactivateHostnameBlockCleanups,
} from '@queues/background/enqueues/hostname-blocking'
import { createHostnameBlockingHandlers } from './hostname-blocking-handler-factory.mts'

export const hostnameBlockingHandlers = createHostnameBlockingHandlers({
  enqueueCleanups: enqueueOrReactivateHostnameBlockCleanups,
  enqueueRecovery: enqueueHostnameBlockRecovery,
})
