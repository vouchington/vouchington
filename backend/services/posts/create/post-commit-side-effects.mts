import onError from '@modules/on-error'
import { normalizeKey } from '@ts-shared/utils/strings'
import { addEntityBloomKeys } from '@services/entity-cache/bloom-filter-repair'
import { settlePostCommitEffects } from '../post-commit-completion.mts'
import { enqueueOnPostCreated } from '@queues/entity-listeners/enqueues'

type PostCommitSideEffectsDependencies = {
  enqueueOnPostCreated: typeof enqueueOnPostCreated
  addEntityBloomKeys: typeof addEntityBloomKeys
  onError: typeof onError
}

const defaultPostCommitSideEffectsDependencies: PostCommitSideEffectsDependencies = {
  enqueueOnPostCreated,
  addEntityBloomKeys,
  onError,
}

export async function applyPostCommitSideEffects(
  input: {
    post: { id: string; slug?: string | null }
  },
  dependencies: Partial<PostCommitSideEffectsDependencies> = {},
): Promise<void> {
  const { post } = input
  const resolvedDependencies = { ...defaultPostCommitSideEffectsDependencies, ...dependencies }
  const bloomKeys = [normalizeKey(post.id)]
  if (post.slug) bloomKeys.push(normalizeKey(post.slug))
  await settlePostCommitEffects(
    [
      { start: () => resolvedDependencies.addEntityBloomKeys('posts', bloomKeys) },
      {
        start: () => resolvedDependencies.enqueueOnPostCreated(post.id),
        isRejectionReported: () => true,
      },
    ],
    resolvedDependencies.onError,
  )
}
