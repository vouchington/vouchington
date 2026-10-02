import type { PrivateUser } from '@services/users/types'
import { getUserActivePlan } from '@services/memberships'
import { getTopicAliasIdByKey } from '@services/topics/get-topic-aliases'
import type { PostMutationAuthority } from '@services/entity-relations/post-access'
import { resolveHashtagMutation } from './hashtag-mutation-access.mts'
import { updatePost } from './update.mts'

export async function addPostHashtag(
  currentUser: PrivateUser,
  postId: string,
  tag: string,
  authority: PostMutationAuthority,
): Promise<{ post_id: string; tag: string; topic_alias_id: string }> {
  // ast-grep-ignore: no-three-sequential-awaits -- private authorization must precede plan resolution and the mutation it constrains.
  const { post, normalized, rootIds } = await resolveHashtagMutation(
    currentUser,
    postId,
    tag,
    authority,
  )
  const membershipPlan = await getUserActivePlan(currentUser.id)
  await updatePost(currentUser, post, {}, membershipPlan, {
    change: { op: 'add', hashtag: normalized },
    authority,
    rootIds,
  })

  const aliasId = await getTopicAliasIdByKey(normalized.key)
  if (!aliasId) throw new Error('Committed hashtag alias is missing from the primary')
  return { post_id: post.id, tag: normalized.key, topic_alias_id: aliasId }
}
