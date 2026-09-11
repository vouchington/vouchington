import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationReportEntityType } from '@ts-shared/utils/moderation-reports'

export type EntityContent = {
  text: string
  communityRules: string | null
  /** Non-null when the entity belongs to a community (posts/comments only). */
  communityId: string | null
  /** The authoring/owning user id, used as the OpenAI safety_identifier for actor tracking. */
  authorId: string | null
}

export async function fetchEntityContent(
  entityType: ModerationReportEntityType,
  entityId: string,
): Promise<EntityContent | null> {
  if (entityType === 'post' || entityType === 'comment') {
    const { rows } = await read(sql`/* fetchEntityContent:post-or-comment */
      SELECT
        p.title,
        p.markdown,
        p.community_id,
        p.created_by_id,
        c.rules_markdown AS community_rules
      FROM posts p
      LEFT JOIN communities c ON c.id = p.community_id
      WHERE p.id = ${entityId}
        AND p.deleted_at IS NULL
      LIMIT 1
    `)
    const row = rows[0] as
      | {
          title: string
          markdown: string
          community_id: string | null
          created_by_id: string | null
          community_rules: string | null
        }
      | undefined
    if (!row) return null
    const parts: string[] = []
    if (row.title) parts.push(`Title: ${row.title}`)
    // Bound very large posts to protect against token bloat / context-window overflow.
    if (row.markdown) parts.push(`Content: ${row.markdown.slice(0, 10000)}`)
    return {
      text: parts.join('\n\n') || '(no content)',
      communityRules: row.community_rules,
      communityId: row.community_id,
      authorId: row.created_by_id,
    }
  }

  if (entityType === 'user') {
    const { rows } = await read(sql`/* fetchEntityContent:user */
      SELECT id, username, markdown AS bio
      FROM users
      WHERE id = ${entityId}
        AND deleted_at IS NULL
      LIMIT 1
    `)
    const row = rows[0] as { id: string; username: string; bio: string | null } | undefined
    if (!row) return null
    return {
      text: `Username: ${row.username}${row.bio ? `\nBio: ${row.bio}` : ''}`,
      communityRules: null,
      communityId: null,
      authorId: row.id,
    }
  }

  if (entityType === 'rss_feed_item') {
    const { rows } = await read(sql`/* fetchEntityContent:rss_feed_item */
      SELECT
        data->>'title' AS title,
        COALESCE(
          NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(data->>'content:encodedSnippet', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
          NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(data->>'content:encoded', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
          NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(data->>'contentSnippet', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
          NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(data->>'content', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
          NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(data->>'summary', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
          NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(data->>'description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), ''),
          NULLIF(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE(data->>'media:description', '<[^>]*>', ' ', 'g'), '&nbsp;|&#160;|&#xA0;', ' ', 'gi')), '')
        ) AS content
      FROM rss_feed_items
      WHERE id = ${entityId}
        AND deleted_at IS NULL
      LIMIT 1
    `)
    const row = rows[0] as { title: string | null; content: string | null } | undefined
    if (!row) return null
    const parts: string[] = []
    if (row.title) parts.push(`Title: ${row.title}`)
    if (row.content) parts.push(`Content: ${row.content.slice(0, 2000)}`)
    return {
      text: parts.join('\n\n') || '(no content)',
      communityRules: null,
      communityId: null,
      authorId: null,
    }
  }

  if (entityType === 'url_hostname') {
    const { rows } = await read(sql`/* fetchEntityContent:url_hostname */
      SELECT hostname
      FROM url_hostnames
      WHERE id = ${entityId}
      LIMIT 1
    `)
    const row = rows[0] as { hostname: string } | undefined
    if (!row) return null
    return {
      text: `Hostname: ${row.hostname}`,
      communityRules: null,
      communityId: null,
      authorId: null,
    }
  }

  return null
}
