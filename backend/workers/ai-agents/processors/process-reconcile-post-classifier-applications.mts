import {
  streamIncompletePostClassifierApplicationBatches,
  type IncompletePostClassifierApplication,
} from '@services/post-classifier'
import { enqueueBulkPostClassifiers } from '@queues/ai-agents/enqueues/post-classifier'

export async function processReconcilePostClassifierApplications(): Promise<{ enqueued: number }> {
  let enqueued = 0
  for await (const applications of streamIncompletePostClassifierApplicationBatches()) {
    await enqueueBulkPostClassifiers(
      applications satisfies readonly IncompletePostClassifierApplication[],
    )
    enqueued += applications.length
  }
  return { enqueued }
}
