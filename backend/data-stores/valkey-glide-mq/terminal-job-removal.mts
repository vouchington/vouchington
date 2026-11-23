import { Batch } from '@glidemq/speedkey'
import { acquireTerminalJobRemoval as acquire } from '@vouchington/utils/terminal-job-removal'
import type { createRetryingCommandClient } from './glide-mq-command-client.mts'

type CommandClient = ReturnType<typeof createRetryingCommandClient>['client']

/** Binds the standalone worker-queue command client to the shared terminal-removal protocol. */
export function acquireTerminalJobRemoval(client: CommandClient, namespace: string, jobId: string) {
  return acquire(
    {
      watch: keys => client.watch(keys),
      unwatch: () => client.unwatch(),
      hget: (key, field) => client.hget(key, field),
      removeJob: (keys, args) =>
        client.exec(new Batch(true).fcall('glidemq_removeJob', keys, args), true),
    },
    namespace,
    jobId,
  )
}
