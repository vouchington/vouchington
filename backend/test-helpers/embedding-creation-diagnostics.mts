import { onTestFinished } from 'vitest'
import type { QueueEventsOptions } from 'glide-mq'

type DiagnosticSnapshot = {
  prefix: QueueEventsOptions['prefix']
  closing: boolean
  writersDrained: boolean
  pending: Array<{ id: string; event: string; occurrence: number }>
  history: Array<{ id: string; events: Record<string, number> }>
}

/** Reports retained owned stream observations, never a fresh state read from a deleted queue. */
export function registerEmbeddingCreationDiagnostics(
  queue: string,
  snapshot: () => DiagnosticSnapshot,
) {
  const diagnostic = () => ({
    queue,
    observation: 'retained owned QueueEvents history; not a current job-state read',
    ...snapshot(),
  })
  onTestFinished(({ task }) => {
    if (task.result?.state !== 'fail') return
    Object.assign(task.meta, { ownedEmbeddingQueue: diagnostic() })
  })
  return diagnostic
}
