import { enqueuePostPublicationEffects } from '@queues/post-publication/enqueues'
import { hashCapturedPublicationKeys } from '@services/post-publication/captured-keys'
import {
  LIVE_SCOPE_POST_KINDS,
  listLiveScopePostPage,
  type LiveScopePostKind,
} from '@services/post-publication/live-scope-post-pages'
import type { PostPublicationEffectsJobData } from '@voucha/types/post-publication'
import { enqueueLivePublicationIdentityEffects } from './direct-live-identities.mts'
import { continuationJob, enqueueSubjectChains, nextContinuation } from './direct-continuations.mts'

type Continuation = NonNullable<PostPublicationEffectsJobData['continuation']>
type ApplyKeys = (
  data: PostPublicationEffectsJobData,
  keys: PostPublicationEffectsJobData['keys'],
  enqueueLivePages: boolean,
) => Promise<{ affectedPosts: number }>

export function isScopePostContinuation(kind: Continuation['kind']): kind is LiveScopePostKind {
  return (LIVE_SCOPE_POST_KINDS as readonly string[]).includes(kind)
}

/** The captured preimage is applied once; scope discovery continues only in Glide jobs. */
export async function enqueueLiveScopePostEffects(
  data: PostPublicationEffectsJobData,
): Promise<void> {
  const kinds: LiveScopePostKind[] =
    data.scope.type === 'author'
      ? ['author_posts']
      : data.scope.type === 'community'
        ? ['community_posts']
        : data.scope.type === 'topic_alias'
          ? ['alias_post_relations', 'alias_post_sources']
          : data.scope.type === 'story'
            ? ['story_posts']
            : []
  // Capture pages share one change: discover its scope once, independently of old-key chunks.
  const scopeData = {
    ...data,
    postId: null,
    keys: [],
    keyHash: hashCapturedPublicationKeys([]),
    chunkIndex: 0,
  }
  await Promise.all(kinds.map(kind => enqueueSubjectChains(scopeData, kind, [data.scope.id])))
}

/** One owner/parent page feeds the same post effects and starts only downward discovery. */
export async function processLiveScopePostContinuation(
  data: PostPublicationEffectsJobData,
  continuation: Continuation,
  applyKeys: ApplyKeys,
): Promise<{ affectedPosts: number }> {
  const subjectId = continuation.subjectIds[continuation.subjectIndex]
  if (!subjectId || !isScopePostContinuation(continuation.kind))
    throw new TypeError('Invalid publication scope continuation')
  const page = await listLiveScopePostPage(continuation.kind, subjectId, continuation.after)
  const [result] = await Promise.all([
    applyKeys(
      data,
      page.ids.map(uuidValue => ({ kind: 'impact_post', uuidValue })),
      false,
    ),
    enqueueLivePublicationIdentityEffects(data, {
      postIds: page.ids,
      descendantPostIds: page.ids,
      topicIds: [],
      rssFeedIds: [],
      rssFeedItemIds: [],
    }),
  ])
  const next = nextContinuation(continuation, page.cursor)
  if (next) await enqueuePostPublicationEffects(continuationJob(data, next))
  return result
}
