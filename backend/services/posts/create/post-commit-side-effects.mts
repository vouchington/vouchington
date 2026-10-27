import { normalizeKey } from '@ts-shared/utils/strings'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { settlePostCommitEffects } from '../post-commit-completion.mts'
import { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'

export async function applyPostCommitSideEffects(input: {
  post: { id: string; slug?: string | null }
}): Promise<void> {
  const { post } = input
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  await settlePostCommitEffects([
    { start: () => addEntityBloomKeys('posts', bloomKeys) },
    {
      start: () => enqueueOnPostCreated(post.id),
      isRejectionReported: () => true,
    },
  ])
}
