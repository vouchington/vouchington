import { TimeUnit, type Script } from '@glidemq/speedkey'
import {
  ADMIT_SCHEDULED_RUN_LUA,
  DEFAULT_MAX_STALLED_COUNT,
  RELEASE_SCHEDULED_RUN_LUA,
  createGuardedProcessors,
  createScheduledRunLease,
} from '@vouchington/worker-runtime/glide-mq'
import onError from '@modules/on-error'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import { registerWorkerQueueScript } from './glide-mq-scripts.mts'

const scripts = new Map<string, Script>([
  [ADMIT_SCHEDULED_RUN_LUA, registerWorkerQueueScript(ADMIT_SCHEDULED_RUN_LUA)],
  [RELEASE_SCHEDULED_RUN_LUA, registerWorkerQueueScript(RELEASE_SCHEDULED_RUN_LUA)],
])

const lease = createScheduledRunLease({
  prefix: workerQueuePrefix,
  onError,
  defaultMaxStalledCount: DEFAULT_MAX_STALLED_COUNT,
  client: {
    hget: (key, field) => workerQueueCommandClient.hget(key, field),
    get: key => workerQueueCommandClient.get(key),
    set: (key, value, expiryMs) =>
      workerQueueCommandClient.set(key, value, {
        expiry: { type: TimeUnit.Milliseconds, count: expiryMs },
      }),
    hincrBy: (key, field, amount) => workerQueueCommandClient.hincrBy(key, field, amount),
    runScript: (lua, keys, args) =>
      workerQueueCommandClient.invokeScript(scripts.get(lua)!, { keys, args }),
  },
})

/** Scheduled-run leases and the self-add guard, bound to the worker-queue command client. */
export const guardedProcessors = createGuardedProcessors({
  lease,
  onError,
  throwOnSelfAdd: process.env.NODE_ENV !== 'production',
})
