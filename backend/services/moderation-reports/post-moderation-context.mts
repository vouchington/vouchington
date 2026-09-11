import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type OpenAIModerationContext = {
  flagged: boolean
  /** Category labels from OpenAI omni-moderation results (staff only). */
  categories?: string[]
}

export type AgentModerationContext = {
  slug: string
  flagged: boolean
  /** Category labels from agent results (staff only). */
  categories?: string[]
}

export type PostModerationContext = {
  openai_moderation: OpenAIModerationContext | null
  agent_moderations: AgentModerationContext[]
  /** Topic slugs added to the post by moderator-agent system users. */
  agent_added_tags: string[]
}

export type PostModerationContextTier = 'staff' | 'public'

/**
 * Returns per-post moderation context for a batch of post IDs.
 *
 * Staff tier includes full OpenAI results and agent category details.
 * Public tier returns only flagged booleans and agent_added_tags.
 */
export async function getPostModerationContextBatch(
  postIds: string[],
  tier: PostModerationContextTier = 'public',
): Promise<Map<string, PostModerationContext>> {
  if (postIds.length === 0) return new Map()

  const idList = postIds.map(id => sql`${id}::uuid`).reduce((a, b) => a.append(sql`, `).append(b))

  // Fetch OpenAI omni-moderation flags from posts table
  const postsQuery = sql`/* getPostModerationContextBatch:posts */
    SELECT
      id,
      openai_omni_moderation_flagged,
      openai_omni_moderation_results
    FROM posts
    WHERE id IN (`
  postsQuery.append(idList)
  postsQuery.append(sql`)`)

  // Fetch agent_moderations joined through agents__moderators for slug
  const agentQuery = sql`/* getPostModerationContextBatch:agents */
    SELECT
      am.post_id,
      mo.slug,
      am.flagged,
      am.results
    FROM agent_moderations am
    JOIN agents__moderators mo ON mo.agent_id = am.agent_id
    WHERE am.post_id IN (`
  agentQuery.append(idList)
  agentQuery.append(sql`)
      AND am.deleted_at IS NULL
    ORDER BY am.post_id, am.created_at DESC
  `)

  // Fetch topic slugs added by agents with the moderator role (system users)
  // Agent system users are identified via agents.system_user_id; tags are in
  // relation__post__category__topic via the created_by_id column.
  const tagsQuery = sql`/* getPostModerationContextBatch:tags */
    SELECT DISTINCT
      rpct.subject_id AS post_id,
      t.slug AS topic_slug
    FROM relation__post__category__topic rpct
    JOIN agents ON agents.system_user_id = rpct.created_by_id
    JOIN agents__moderators mod ON mod.agent_id = agents.id
    JOIN topics t ON t.id = rpct.object_id
    WHERE rpct.subject_id IN (`
  tagsQuery.append(idList)
  tagsQuery.append(sql`)
      AND rpct.deleted_at IS NULL
      AND t.deleted_at IS NULL
      AND t.merged_into_topic_id IS NULL
  `)

  const [postsResult, agentResult, tagsResult] = await Promise.all([
    read(postsQuery),
    read(agentQuery),
    read(tagsQuery),
  ])

  // Build agent_added_tags map
  const tagsByPost = new Map<string, string[]>()
  for (const row of tagsResult.rows as Array<{ post_id: string; topic_slug: string }>) {
    const list = tagsByPost.get(row.post_id) ?? []
    list.push(row.topic_slug)
    tagsByPost.set(row.post_id, list)
  }

  // Build agent moderations map (post_id → array)
  const agentsByPost = new Map<
    string,
    Array<{ slug: string; flagged: boolean; results: unknown }>
  >()
  for (const row of agentResult.rows as Array<{
    post_id: string
    slug: string
    flagged: boolean
    results: unknown
  }>) {
    const list = agentsByPost.get(row.post_id) ?? []
    list.push(row)
    agentsByPost.set(row.post_id, list)
  }

  const result = new Map<string, PostModerationContext>()

  for (const row of postsResult.rows as Array<{
    id: string
    openai_omni_moderation_flagged: boolean | null
    openai_omni_moderation_results: unknown
  }>) {
    const agentRows = agentsByPost.get(row.id) ?? []

    const openai_moderation: OpenAIModerationContext | null =
      row.openai_omni_moderation_flagged !== null
        ? {
            flagged: row.openai_omni_moderation_flagged,
            ...(tier === 'staff'
              ? { categories: extractOpenAICategories(row.openai_omni_moderation_results) }
              : {}),
          }
        : null

    const agent_moderations: AgentModerationContext[] = agentRows.map(a => ({
      slug: a.slug,
      flagged: a.flagged,
      ...(tier === 'staff' ? { categories: extractAgentCategories(a.results) } : {}),
    }))

    result.set(row.id, {
      openai_moderation,
      agent_moderations,
      agent_added_tags: tagsByPost.get(row.id) ?? [],
    })
  }

  // Ensure all requested post IDs have an entry
  for (const postId of postIds) {
    if (!result.has(postId)) {
      result.set(postId, {
        openai_moderation: null,
        agent_moderations: [],
        agent_added_tags: tagsByPost.get(postId) ?? [],
      })
    }
  }

  return result
}

function extractOpenAICategories(results: unknown): string[] {
  if (!results || typeof results !== 'object') return []
  // openai_omni_moderation_results is stored as the array returned by the omni
  // moderation API: [{ flagged, categories: { hate: true, ... }, ... }, ...].
  // Older/object-shaped rows ({ categories: {...} }) are also tolerated.
  const entries = Array.isArray(results) ? results : [results]
  const flagged = new Set<string>()
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const categories = (entry as Record<string, unknown>)['categories']
    if (!categories || typeof categories !== 'object') continue
    for (const [k, v] of Object.entries(categories as Record<string, boolean>)) {
      if (v === true) flagged.add(k)
    }
  }
  return [...flagged]
}

function extractAgentCategories(results: unknown): string[] {
  if (!results || typeof results !== 'object') return []
  const r = results as Record<string, unknown>
  if (Array.isArray(r['categories'])) {
    return (r['categories'] as unknown[]).filter((c): c is string => typeof c === 'string')
  }
  return []
}
