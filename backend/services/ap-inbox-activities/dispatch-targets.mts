import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
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

// Undo must keep its activity marker even if the target has since disabled federation.
export async function resolveUndoTargetUserId(
  followObject: unknown,
  options: QueryOptions = {},
): Promise<string | undefined> {
  if (typeof followObject !== 'string') return undefined
  const targetUserId = parseLocalActorUriUserId(followObject)
  if (!targetUserId || !isUUID(targetUserId)) return undefined
  const run = options.query ?? write
  const { rows } = await run(sql`/* resolveUndoTargetUserId */
    SELECT id FROM users WHERE id = ${targetUserId} AND deleted_at IS NULL LIMIT 1
  `)
  return rows.length > 0 ? targetUserId : undefined
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

// The Undo marker belongs to the original post even when it is no longer visible.
export async function resolveUndoLikeTargetPostId(
  likeObject: unknown,
  options: QueryOptions = {},
): Promise<string | undefined> {
  if (typeof likeObject !== 'string') return undefined
  const postId = parseLocalPostUriId(likeObject)
  if (!postId || !isUUID(postId)) return undefined
  const post = await getPostByAny(postId, options)
  return post?.id
}

export function getEmbeddedActivity(
  undoObject: unknown,
  type: 'Follow' | 'Like',
): { id: string; object: unknown } | undefined {
  if (typeof undoObject !== 'object' || undoObject === null) return undefined
  const record = undoObject as Record<string, unknown>
  if (record.type !== type) return undefined
  if (typeof record.id !== 'string' || record.id.length === 0) return undefined
  return { id: record.id, object: record.object }
}
