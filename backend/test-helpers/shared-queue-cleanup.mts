import { getOrCreateQueue } from '@vouchington/worker-runtime/testing'

/**
 * Forgets deduplication keys in a shared queue without touching any job, so a test that pinned the
 * clock leaves no throttle window behind (a window recorded at the pinned time would throttle every
 * later real-time enqueue of the same key), and starts without one a sibling file recorded.
 */
export function forgetDedupEntries(queueName: string, dedupIds: readonly string[]): void {
  const entries = getOrCreateQueue(queueName).dedupEntries
  for (const id of dedupIds) entries.delete(id)
}

/** Removes only the jobs with these ids, so cleanup on a shared queue never drops another domain's work. */
export async function removeQueuedJobsById(
  queue: { getJob: (id: string) => Promise<{ remove: () => Promise<unknown> } | null | undefined> },
  ids: readonly string[],
): Promise<void> {
  await Promise.all(ids.map(async id => (await queue.getJob(id))?.remove()))
}
