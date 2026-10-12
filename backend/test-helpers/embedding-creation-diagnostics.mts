import { onTestFinished } from 'vitest'
import type { Queue, QueueEventsOptions } from 'glide-mq'

type DiagnosticSnapshot = {
  prefix: QueueEventsOptions['prefix']
  closing: boolean
  writersDrained: boolean
  pending: Array<{ id: string; event: string; occurrence: number }>
  history: Array<{ id: string; events: Record<string, number> }>
}

/** Diagnostic reads never precede or skip the queue owner's mandatory cleanup. */
export function registerEmbeddingCreationDiagnostics(
  queue: Queue,
  snapshot: () => DiagnosticSnapshot,
): () => Promise<void> {
  const reads: Promise<void>[] = []
  onTestFinished(({ task }) => {
    if (task.result?.state !== 'fail') return
    const diagnostic = {
      queue: queue.name,
      ...snapshot(),
      jobs: [] as Array<{ id: string; state?: string; readError?: string }>,
    }
    Object.assign(task.meta, { ownedEmbeddingQueue: diagnostic })
    const ids = new Set([
      ...diagnostic.history.map(({ id }) => id),
      ...diagnostic.pending.map(({ id }) => id),
    ])
    for (const id of ids) {
      // Queue reads do not borrow the worker's blocking connection or PostgreSQL pool.
      reads.push(
        Promise.resolve()
          .then(() => queue.getJob(id))
          .then(job => job?.getState())
          .then(
            state => {
              return void diagnostic.jobs.push({ id, state })
            },
            err => {
              return void diagnostic.jobs.push({
                id,
                readError: err instanceof Error ? err.name : typeof err,
              })
            },
          ),
      )
    }
  })
  return async () => {
    for (const read of reads) await Promise.allSettled([read])
  }
}
