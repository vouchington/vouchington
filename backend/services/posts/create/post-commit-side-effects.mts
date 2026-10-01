import type { PrivateUser } from '@services/users/types'
import type { CreatePostInput } from '../types.mts'
import { normalizeKey } from '@ts-shared/utils/strings'
import { entityCacheBloomFilters } from '@services/entity-cache/backfill-bloom-filter'
import { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'

type PostCommitSideEffectsDependencies = {
  enqueueOnPostCreated: typeof enqueueOnPostCreated
}

const defaultPostCommitSideEffectsDependencies: PostCommitSideEffectsDependencies = {
  enqueueOnPostCreated,
}

export async function applyPostCommitSideEffects(
  input: {
    creator: PrivateUser
    post: { id: string; slug?: string | null }
    postType: NonNullable<CreatePostInput['post_type']>
    updates: CreatePostInput
  },
  dependencies: Partial<PostCommitSideEffectsDependencies> = {},
): Promise<void> {
  const { post } = input
  const resolvedDependencies = { ...defaultPostCommitSideEffectsDependencies, ...dependencies }
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  void entityCacheBloomFilters.posts.add(bloomKeys)
  void resolvedDependencies.enqueueOnPostCreated(post.id)
}
