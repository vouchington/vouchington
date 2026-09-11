import type { QueryOptions } from '@data-stores/psql'
import { parseLocalActorUriUserId, parseLocalPostUriId } from '@modules/activitypub-uris'
import { isUUID } from '@modules/utils'
import { canViewPost, getPostByAny } from '@services/posts'
import { isFederationEnabledForUser } from '@services/users'

// Resolve untrusted ActivityPub target URIs through the same transaction used for the eventual
// write. Invalid, absent, private, or federation-disabled targets are silent protocol no-ops.
export async function resolveFederatedTargetUserId(
  followObject: unknown,
  options: QueryOptions = {},
): Promise<string | undefined> {
  if (typeof followObject !== 'string') return undefined
  const targetUserId = parseLocalActorUriUserId(followObject)
  if (!targetUserId || !isUUID(targetUserId)) return undefined
  return (await isFederationEnabledForUser(targetUserId, options)) ? targetUserId : undefined
}

export async function resolveLikeTargetPostId(
  likeObject: unknown,
  options: QueryOptions = {},
): Promise<string | undefined> {
  if (typeof likeObject !== 'string') return undefined
  const postId = parseLocalPostUriId(likeObject)
  if (!postId || !isUUID(postId)) return undefined
  const post = await getPostByAny(postId, options)
  if (!post) return undefined
  return (await canViewPost(null, post, options)) ? postId : undefined
}

export function getEmbeddedActivity(
  undoObject: unknown,
  type: 'Follow' | 'Like',
): { object: unknown } | undefined {
  if (typeof undoObject !== 'object' || undoObject === null) return undefined
  const record = undoObject as Record<string, unknown>
  if (record.type !== type) return undefined
  return { object: record.object }
}
