import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { VoteIntegrityFlag } from './create-flag.mts'

export async function attachVoteFlagEntityLabels<T extends VoteIntegrityFlag>(
  flags: T[],
  query: QueryExecutor = read,
): Promise<
  Array<
    T & {
      entity_label: string
      resolver_username: string | null
      resolver_display_name: string | null
    }
  >
> {
  if (flags.length === 0) return []
  const ids = flags.map(flag => flag.id)
  const { rows } = await query<{
    id: string
    entity_label: string
    resolver_username: string | null
    resolver_display_name: string | null
  }>(sql`
    /* attachVoteFlagEntityLabels */
    SELECT f.id, resolver_profile.username AS resolver_username,
      resolver_profile.verified_display_name AS resolver_display_name,
      CASE
        WHEN f.post_id IS NOT NULL AND p.deleted_at IS NULL THEN COALESCE(
          NULLIF(BTRIM(p.title), ''), slug.slug, NULLIF(BTRIM(LEFT(p.markdown, 80)), ''), p.post_type::text, 'post'
        )
        WHEN f.post_id IS NOT NULL THEN 'post'
        WHEN f.topic_id IS NOT NULL THEN COALESCE(t.name, t.slug, 'topic')
        WHEN f.hostname_id IS NOT NULL THEN COALESCE(h.hostname, 'hostname')
        WHEN f.rss_feed_item_id IS NOT NULL AND rfi.deleted_at IS NULL THEN COALESCE(
          NULLIF(BTRIM(rfi.data->>'title'), ''), NULLIF(BTRIM(rfi.data->>'url'), ''), 'rss_feed_item'
        )
        WHEN f.rss_feed_item_id IS NOT NULL THEN 'rss_feed_item'
        WHEN f.agent_moderation_id IS NOT NULL THEN COALESCE(agent.slug, 'agent_moderation')
        ELSE f.flag_type::text
      END AS entity_label
    FROM vote_integrity_flags f
    LEFT JOIN posts p ON p.id = f.post_id
    LEFT JOIN LATERAL (
      SELECT ps.slug FROM post_slugs ps WHERE ps.post_id = p.id ORDER BY ps.id DESC LIMIT 1
    ) slug ON true
    LEFT JOIN topics t ON t.id = f.topic_id
    LEFT JOIN url_hostnames h ON h.id = f.hostname_id
    LEFT JOIN rss_feed_items rfi ON rfi.id = f.rss_feed_item_id
    LEFT JOIN agent_moderations am ON am.id = f.agent_moderation_id
    LEFT JOIN moderator_agents agent ON agent.agent_id = am.agent_id
    LEFT JOIN view_users_public resolver_profile ON resolver_profile.id = f.resolved_by_id
    WHERE f.id = ANY(${ids}::uuid[])
  `)
  const facts = new Map(rows.map(row => [row.id, row]))
  return flags.map(flag => ({
    ...flag,
    entity_label: facts.get(flag.id)?.entity_label ?? flag.flag_type,
    resolver_username: facts.get(flag.id)?.resolver_username ?? null,
    resolver_display_name: facts.get(flag.id)?.resolver_display_name ?? null,
  }))
}
