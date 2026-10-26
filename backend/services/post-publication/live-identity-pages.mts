import { write } from '@data-stores/psql'
import { getPostPublicationWorkLimit } from './work-limits.mts'
import type { PublicationCapturedKey } from './captured-keys.mts'

/** The (topic_id, alias) index serves one bounded page of current aliases. */
export async function listLiveTopicAliasesPage(
  topicId: string,
  afterAlias: string | null,
): Promise<{ aliases: string[]; cursor: string | null }> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const { rows } = await write<{ alias: string }>(
    `/* listLiveTopicAliasesPage */
    SELECT alias FROM topic_aliases
    WHERE topic_id = $1::uuid
      AND alias > COALESCE($2::text, ''::text)
    ORDER BY alias LIMIT $3`,
    [topicId, afterAlias, limit],
  )
  return {
    aliases: rows.map(row => row.alias),
    cursor: rows.length === limit ? rows.at(-1)!.alias : null,
  }
}

/** A single indexed lookup for each already bounded author/community/topic ID page. */
export async function listLivePublicationIdentityNames(ids: {
  userIds: readonly string[]
  communityIds: readonly string[]
  topicIds: readonly string[]
}): Promise<{ usernames: string[]; communitySlugs: string[]; topicSlugs: string[] }> {
  const limit = getPostPublicationWorkLimit('capture_batch_size')
  const users = [...new Set(ids.userIds)]
  const communities = [...new Set(ids.communityIds)]
  const topics = [...new Set(ids.topicIds)]
  if ([users, communities, topics].some(page => page.length > limit + 1))
    throw new RangeError('Publication identity job exceeds its page limit')
  const [userRows, communityRows, topicRows] = await Promise.all([
    users.length > 0
      ? write<{ username: string }>(
          `/* listLivePublicationIdentityNames:users */
          SELECT username FROM users WHERE id = ANY($1::uuid[])`,
          [users],
        )
      : Promise.resolve({ rows: [] as Array<{ username: string }> }),
    communities.length > 0
      ? write<{ slug: string }>(
          `/* listLivePublicationIdentityNames:communities */
          SELECT slug FROM communities WHERE id = ANY($1::uuid[])`,
          [communities],
        )
      : Promise.resolve({ rows: [] as Array<{ slug: string }> }),
    topics.length > 0
      ? write<{ slug: string }>(
          `/* listLivePublicationIdentityNames:topics */
          SELECT slug FROM topics
          WHERE id = ANY($1::uuid[])
            AND deleted_at IS NULL AND merged_into_topic_id IS NULL`,
          [topics],
        )
      : Promise.resolve({ rows: [] as Array<{ slug: string }> }),
  ])
  return {
    usernames: userRows.rows.map(row => row.username),
    communitySlugs: communityRows.rows.map(row => row.slug),
    topicSlugs: topicRows.rows.map(row => row.slug),
  }
}

/** One live scope row supplies names and topic ownership that survive the mutation. */
export async function listLivePublicationScopeKeys(scope: {
  type: string
  id: string
}): Promise<PublicationCapturedKey[]> {
  if (scope.type === 'topic_alias') {
    const { rows } = await write<{ alias: string; topic_id: string | null }>(
      `/* listLivePublicationScopeKeys:alias */
      SELECT alias, topic_id FROM topic_aliases WHERE id = $1::uuid`,
      [scope.id],
    )
    const row = rows[0]
    if (!row) return []
    return [
      { kind: 'identity_topic_alias', textValue: row.alias },
      ...(row.topic_id ? [{ kind: 'impact_topic' as const, uuidValue: row.topic_id }] : []),
    ]
  }
  if (scope.type === 'rss_feed') {
    const { rows } = await write<{ topic_id: string }>(
      `/* listLivePublicationScopeKeys:feed */
      SELECT topic_id FROM rss_feeds WHERE id = $1::uuid`,
      [scope.id],
    )
    return rows[0] ? [{ kind: 'impact_topic', uuidValue: rows[0].topic_id }] : []
  }
  return []
}
