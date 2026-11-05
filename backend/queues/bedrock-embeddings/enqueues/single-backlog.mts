import { getSingleBacklogScanCap } from '@queues/background-cpu/config'
import { backgroundCpu } from '@queues/background-cpu/queues'
import { getBacklogThreshold } from '@services/bedrock-embeddings/batch/config'
import type { Queue } from 'glide-mq'

const CACHE_TTL_MS = 2_000
const SINGLE_NAMES = new Set([
  'bedrock-embeddings.topic',
  'bedrock-embeddings.post',
  'bedrock-embeddings.rss_feed_item',
])
const STATES = ['waiting', 'active', 'delayed'] as const
export type SingleEmbeddingBacklogSnapshot = { depth: number; uncertain: boolean }
type BacklogQueue = Pick<Queue, 'getJobs'>
const snapshots = new WeakMap<
  BacklogQueue,
  { at: number; cap: number; result: Promise<SingleEmbeddingBacklogSnapshot> }
>()

/** A bounded shared-queue scan, exact below the cap and a matching-job lower bound at saturation. */
export function getSingleEmbeddingBacklogSnapshot(
  queue: BacklogQueue = backgroundCpu,
  cap = getSingleBacklogScanCap(),
  now = Date.now(),
): Promise<SingleEmbeddingBacklogSnapshot> {
  const cached = snapshots.get(queue)
  if (cached && cached.cap === cap && now - cached.at < CACHE_TTL_MS) return cached.result
  const result = readSingleEmbeddingBacklogSnapshot(queue, cap).catch((err: unknown) => {
    if (snapshots.get(queue)?.result === result) snapshots.delete(queue)
    throw err
  })
  snapshots.set(queue, { at: now, cap, result })
  return result
}

export async function isSingleEmbeddingBackedUp(
  queue: BacklogQueue = backgroundCpu,
  cap = getSingleBacklogScanCap(),
  threshold?: number,
  now = Date.now(),
): Promise<boolean> {
  return shouldDeferSingleEmbedding(
    await getSingleEmbeddingBacklogSnapshot(queue, cap, now),
    threshold ?? getBacklogThreshold(),
  )
}

function shouldDeferSingleEmbedding(
  snapshot: SingleEmbeddingBacklogSnapshot,
  threshold: number,
): boolean {
  return snapshot.depth >= threshold
}

async function readSingleEmbeddingBacklogSnapshot(
  queue: Pick<Queue, 'getJobs'>,
  cap: number,
): Promise<SingleEmbeddingBacklogSnapshot> {
  const pages = await Promise.all(
    STATES.map(state => queue.getJobs(state, 0, cap - 1, { excludeData: true })),
  )
  let depth = 0
  let uncertain = false
  for (const jobs of pages) {
    depth += jobs.filter(job => SINGLE_NAMES.has(job.name)).length
    if (jobs.length >= cap) uncertain = true
  }
  return { depth, uncertain }
}
