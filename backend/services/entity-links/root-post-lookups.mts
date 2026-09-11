import { getPostByAnyCachedBatch } from '@services/entity-fetch'
import type { EntityMention, PostMention } from './types.mts'

export async function getRootPostsForCommentMentions(
  mentions: EntityMention[],
  lookupByType: Map<string, Map<string, unknown | null>>,
  lookupErrorByType: Map<string, boolean>,
) {
  if (lookupErrorByType.get('post')) {
    return { failed: false, roots: new Map<string, unknown | null>() }
  }

  const postLookup = lookupByType.get('post')
  if (!postLookup) {
    return { failed: false, roots: new Map<string, unknown | null>() }
  }

  const commentMentions = mentions.filter(
    (mention): mention is PostMention => mention.type === 'post',
  )
  const rootIds = [
    ...new Set(
      commentMentions.flatMap(mention => {
        const entity = postLookup.get(mention.identifier)
        if (
          !entity ||
          typeof entity !== 'object' ||
          (entity as { post_type?: string }).post_type !== 'comment' ||
          !(entity as { root_id?: string | null }).root_id
        )
          return []
        return [(entity as { root_id: string }).root_id]
      }),
    ),
  ]

  if (rootIds.length === 0) {
    return { failed: false, roots: new Map<string, unknown | null>() }
  }

  let rootPosts: Array<unknown | null>
  try {
    rootPosts = await getPostByAnyCachedBatch(rootIds)
  } catch {
    return { failed: true, roots: new Map<string, unknown | null>() }
  }

  const rootPostMap = new Map<string, unknown | null>()
  for (let i = 0; i < rootIds.length; i++) {
    rootPostMap.set(rootIds[i]!, rootPosts[i] ?? null)
  }

  const commentRootMap = new Map<string, unknown | null>()
  for (const mention of commentMentions) {
    const entity = postLookup.get(mention.identifier) as
      | { id: string; post_type: string; root_id?: string | null }
      | null
      | undefined
    if (entity?.post_type !== 'comment' || !entity.root_id) continue
    commentRootMap.set(entity.id, rootPostMap.get(entity.root_id) ?? null)
  }

  return { failed: false, roots: commentRootMap }
}
