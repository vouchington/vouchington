import assert from 'http-assert'
import { getCommunity } from '@services/communities/get'
import { assertValidPostAudience } from '../audience.mts'
import type { Post, UpdatePostChanges } from '../types.mts'
import type { QueryOptions } from '@data-stores/psql/types'

export async function assertValidAudienceUpdate(
  post: Post,
  changes: UpdatePostChanges,
  options: QueryOptions,
) {
  if (post.post_type === 'comment' || (!changes.broadcast && !changes.privacy)) return false

  const newBroadcast = changes.broadcast ?? post.broadcast
  const newPrivacy = changes.privacy ?? post.privacy
  assertValidPostAudience(newBroadcast, newPrivacy)
  if (post.community_id) {
    assert(
      (newBroadcast === 'everyone' && newPrivacy === 'public') ||
        (newBroadcast === 'users' && newPrivacy === 'private'),
      422,
      'Community posts must be public for everyone or private for signed-in users',
    )
    const community = await getCommunity(post.community_id, options)
    assert(community, 404, 'Community not found')
    assert(
      community.visibility === 'public' || (newBroadcast === 'users' && newPrivacy === 'private'),
      422,
      'Private community posts must be private for signed-in users',
    )
  }
  return true
}
