import { Batch } from '@glidemq/speedkey'
import type { Job, Queue } from 'glide-mq'
import pMap from 'p-map'
import { workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { createRetryingCommandClient } from './glide-mq-command-client.mts'

type CommandClient = ReturnType<typeof createRetryingCommandClient>['client']

/** Hold WATCH on one dedicated connection until native removal or explicit release. */
export async function acquireTerminalJobRemoval(
  client: CommandClient,
  namespace: string,
  jobId: string,
) {
  const jobKey = `${namespace}:job:${jobId}`
  await client.watch([jobKey])
  let watched = true
  const release = async () => {
    if (!watched) return
    await client.unwatch()
    watched = false
  }
  const state = await client.hget(jobKey, 'state')
  if (state === null) return { state: 'missing' as const, release }
  if (state !== 'completed' && state !== 'failed') return { state: 'live' as const, release }

  return {
    state: 'terminal' as const,
    terminalState: state,
    release,
    // The caller may preserve page checkpoints while this hash is still WATCHed.
    readData: () => client.hget(jobKey, 'data'),
    async remove(): Promise<boolean> {
      const result = await client.exec(
        new Batch(true).fcall(
          'glidemq_removeJob',
          [
            jobKey,
            `${namespace}:stream`,
            `${namespace}:scheduled`,
            `${namespace}:completed`,
            `${namespace}:failed`,
            `${namespace}:events`,
            `${namespace}:log:${jobId}`,
          ],
          [jobId],
        ),
        true,
      )
      watched = false
      // A concurrent retry changes the watched hash, so null means no removal on this pass.
      // Native removal leaves cross-queue parent notifications in xq-pending for its scheduler.
      return result !== null && result[0] !== 0
    },
  }
}

/** Re-read data under WATCH before pruning retained failed jobs. */
export async function removeTerminalJobsWhen<D>(
  queue: Pick<Queue<D>, 'name' | 'getJob'>,
  jobIds: readonly string[],
  canRemove: (job: Job<D>) => boolean | Promise<boolean>,
): Promise<number> {
  const namespace = `${workerQueuePrefix ?? 'glide'}:{${queue.name}}`
  const dedicated = createRetryingCommandClient('terminal-job-pruning')
  try {
    // One dedicated WATCH connection serializes the bounded page's state check and native remove.
    const outcomes = await pMap(
      jobIds,
      async jobId => {
        const claim = await acquireTerminalJobRemoval(dedicated.client, namespace, jobId)
        try {
          if (claim.state !== 'terminal' || claim.terminalState !== 'failed') return false
          const current = await queue.getJob(jobId)
          return current !== null && (await canRemove(current)) && (await claim.remove())
        } finally {
          await claim.release()
        }
      },
      { concurrency: 1 },
    )
    return outcomes.filter(Boolean).length
  } finally {
    await dedicated.close()
  }
}
