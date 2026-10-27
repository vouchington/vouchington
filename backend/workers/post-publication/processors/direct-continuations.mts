import { enqueueBulkPostPublicationEffects } from '@queues/post-publication/enqueues'
import { getPostPublicationWorkLimit } from '@services/post-publication/work-limits'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
type Continuation = NonNullable<PostPublicationEffectsJobData['continuation']>

export async function enqueueSubjectChains(
  data: PostPublicationEffectsJobData,
  kind: Continuation['kind'],
  ids: readonly string[],
): Promise<void> {
  await enqueueBulkPostPublicationEffects(subjectChainJobs(data, kind, ids))
}

export function subjectChainJobs(
  data: PostPublicationEffectsJobData,
  kind: Continuation['kind'],
  ids: readonly string[],
): PostPublicationEffectsJobData[] {
  const subjects = [...new Set(ids)].toSorted()
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const jobs: PostPublicationEffectsJobData[] = []
  for (let offset = 0; offset < subjects.length; offset += limit) {
    jobs.push(
      continuationJob(data, {
        kind,
        subjectIds: subjects.slice(offset, offset + limit),
        subjectIndex: 0,
        after: null,
      }),
    )
  }
  return jobs
}

export function continuationJob(
  data: PostPublicationEffectsJobData,
  continuation: Continuation,
): PostPublicationEffectsJobData {
  return {
    ...data,
    postId: null,
    scopeStart: false,
    scopeTopicKeysCaptured: false,
    keyOffset: 0,
    keys: [],
    continuation,
  }
}

export function nextContinuation(
  current: Continuation,
  cursor: string | null,
): Continuation | null {
  if (cursor) return { ...current, after: cursor }
  const subjectIndex = current.subjectIndex + 1
  return subjectIndex < current.subjectIds.length ? { ...current, subjectIndex, after: null } : null
}
