import { workerQueueConnection, workerQueuePrefix } from '@data-stores/valkey-core/glide-mq-client'
import { Queue, QueueEvents } from 'glide-mq'
import onError from '@modules/on-error'
import { workerQueueCommandClient } from './glide-mq-shared-client.mts'
import { registerWorkerQueueScriptFile } from './glide-mq-scripts.mts'

const admitScript = registerWorkerQueueScriptFile(
  'admit-activitypub-inbox-reservation.lua',
  import.meta.url,
)

/** An atomic cap over admitted inbox envelopes, including ordered, active, and delayed jobs. */
export async function reserveActivityPubInboxDelivery(
  queueName: string,
  jobId: string,
  cap: number,
  ttlMs: number,
  maxCap: number,
  prefix = workerQueuePrefix,
): Promise<boolean> {
  if (
    !Number.isSafeInteger(cap) ||
    cap < 1 ||
    !Number.isSafeInteger(maxCap) ||
    maxCap < cap ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 1
  )
    throw new Error('Invalid ActivityPub inbox reservation bounds')
  const baseKey = `${prefix ?? 'glide'}:{${queueName}}`
  const admitted = Number(
    await workerQueueCommandClient.invokeScript(admitScript, {
      keys: [activityPubInboxReservationKey(queueName, prefix)],
      args: [jobId, String(cap), String(ttlMs), `${baseKey}:job:`, String(maxCap)],
    }),
  )
  if (admitted !== 0 && admitted !== 1)
    throw new Error('Unknown ActivityPub inbox reservation result')
  return admitted === 1
}

/** Releasing a unique admission ID cannot remove a later request-digest generation. */
export async function releaseActivityPubInboxDelivery(
  queueName: string,
  jobId: string,
  prefix = workerQueuePrefix,
): Promise<void> {
  await workerQueueCommandClient.zrem(activityPubInboxReservationKey(queueName, prefix), [jobId])
}

export function activityPubInboxReservationKey(
  queueName: string,
  prefix = workerQueuePrefix,
): string {
  return `${prefix ?? 'glide'}:{${queueName}}:activitypub-inbox-reservations`
}

/** Observe native terminal transitions, including failures that remove sensitive payloads. */
export function observeActivityPubInboxReservations(
  queueName: string,
  prefix = workerQueuePrefix,
  onReleased?: (jobId: string) => void,
): { ready: Promise<void>; close(): Promise<void> } {
  const queue = new Queue(queueName, { connection: workerQueueConnection, prefix })
  const events = new QueueEvents(queueName, {
    connection: workerQueueConnection,
    prefix,
    // Native events retain a bounded ~1000-entry history. Replay closes the listener startup
    // gap; unique admission IDs make repeated terminal releases idempotent.
    lastEventId: '0-0',
  })
  const report = (err: unknown) => onError(err instanceof Error ? err : new Error(String(err)))
  const pending = new Set<Promise<void>>()
  const track = (operation: Promise<void>) => {
    const reported = operation.catch(report)
    pending.add(reported)
    void reported.finally(() => pending.delete(reported))
  }
  const release = ({ jobId }: { jobId: string }) => {
    if (!jobId.startsWith('activitypub-inbox__')) return
    track(
      releaseActivityPubInboxDelivery(queueName, jobId, prefix).then(() => {
        return onReleased?.(jobId)
      }),
    )
  }
  events.on('completed', release)
  events.on('removed', release)
  const removeAndRelease = ({ jobId }: { jobId: string }) => {
    if (!jobId.startsWith('activitypub-inbox__')) return
    track(
      (async () => {
        // Native expiry and revocation can leave a failed sensitive hash behind.
        await (await queue.getJob(jobId))?.remove()
        await releaseActivityPubInboxDelivery(queueName, jobId, prefix)
        onReleased?.(jobId)
      })(),
    )
  }
  events.on('failed', removeAndRelease)
  events.on('expired', removeAndRelease)
  events.on('revoked', removeAndRelease)
  events.on('error', report)
  const ready = events.waitUntilReady()
  void ready.catch(report)
  return {
    ready,
    async close() {
      try {
        await events.close()
        await Promise.all(pending)
      } finally {
        await queue.close()
      }
    },
  }
}
