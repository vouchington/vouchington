import { read, type QueryExecutor } from '@data-stores/psql'
import sql, { type SQLStatement } from 'sql-template-strings'
import { CANONICAL_TOPIC_LABEL_SQL, canonicalTopicLabelJoins } from '@modules/topic-labels'
import { attachIntegrityLabelRows } from './attach-label-rows.mts'

type FlagIdentity = { id: string; flag_type: string }
type FlagDomain = 'report' | 'vote'

type FlagLabelRow = {
  id: string
  entity_label: string
  resolver_username: string | null
  resolver_display_name: string | null
  reported_username: string | null
}

export type VoteFlagLabels = Pick<
  FlagLabelRow,
  'entity_label' | 'resolver_username' | 'resolver_display_name'
>
export type ReportFlagLabels = VoteFlagLabels & Pick<FlagLabelRow, 'reported_username'>

/** Keep the domain table, target variants, and joins a closed choice. */
function flagLabelQuery(domain: FlagDomain, ids: string[]): SQLStatement {
  const prefix = sql`/* attachIntegrityFlagEntityLabels */
    SELECT f.id,
      resolver_profile.username AS resolver_username,
      resolver_profile.verified_display_name AS resolver_display_name,
`
  const postCase = sql`CASE
        WHEN f.post_id IS NOT NULL AND p.deleted_at IS NULL THEN COALESCE(
          NULLIF(BTRIM(p.title), ''), slug.slug, NULLIF(BTRIM(LEFT(p.markdown, 80)), ''), 'post'
        )
        WHEN f.post_id IS NOT NULL THEN 'post'
`
  const commonCases = sql`
        WHEN f.hostname_id IS NOT NULL THEN COALESCE(h.hostname, 'url_hostname')
        WHEN f.rss_feed_item_id IS NOT NULL AND rfi.deleted_at IS NULL THEN COALESCE(
          NULLIF(BTRIM(rfi.data->>'title'), ''), NULLIF(BTRIM(rfi.data->>'url'), ''), 'rss_feed_item'
        )
        WHEN f.rss_feed_item_id IS NOT NULL THEN 'rss_feed_item'
`
  const caseEnd = sql`
        ELSE f.flag_type::text
      END AS entity_label
`
  const commonJoins = sql`
    LEFT JOIN posts p ON p.id = f.post_id
    LEFT JOIN LATERAL (
      SELECT ps.slug FROM post_slugs ps WHERE ps.post_id = p.id ORDER BY ps.id DESC LIMIT 1
    ) slug ON true
    LEFT JOIN url_hostnames h ON h.id = f.hostname_id
    LEFT JOIN rss_feed_items rfi ON rfi.id = f.rss_feed_item_id
    LEFT JOIN view_users_public resolver_profile ON resolver_profile.id = f.resolved_by_id
`
  switch (domain) {
    case 'report':
      return prefix
        .append(sql`target_profile.username AS reported_username,`)
        .append(postCase)
        .append(sql`WHEN f.reported_user_id IS NOT NULL THEN CASE
          WHEN target_profile.id IS NOT NULL THEN COALESCE(
            NULLIF(BTRIM(target_profile.verified_display_name), ''), target_profile.username, 'user'
          ) ELSE 'user' END`)
        .append(commonCases)
        .append(caseEnd)
        .append(sql`FROM report_integrity_flags f`)
        .append(commonJoins)
        .append(sql`LEFT JOIN view_users_public target_profile ON target_profile.id = f.reported_user_id
          WHERE f.id = ANY(${ids}::uuid[])`)
    case 'vote':
      return prefix
        .append(sql`NULL::text AS reported_username,`)
        .append(postCase)
        .append(`WHEN f.topic_id IS NOT NULL THEN ${CANONICAL_TOPIC_LABEL_SQL}`)
        .append(commonCases)
        .append(
          sql`WHEN f.agent_moderation_id IS NOT NULL THEN COALESCE(agent.slug, 'agent_moderation')`,
        )
        .append(caseEnd)
        .append(sql`FROM vote_integrity_flags f`)
        .append(commonJoins)
        .append(canonicalTopicLabelJoins('flag'))
        .append(sql`LEFT JOIN agent_moderations am ON am.post_id = f.agent_moderation_post_id
            AND am.id = f.agent_moderation_id AND am.deleted_at IS NULL
          LEFT JOIN moderator_agents agent ON agent.agent_id = am.agent_id
          WHERE f.id = ANY(${ids}::uuid[])`)
    default:
      throw new Error(`Unsupported integrity flag domain: ${domain}`)
  }
}

const voteFacts = (fact: FlagLabelRow | undefined, flag: FlagIdentity): VoteFlagLabels => ({
  entity_label: fact?.entity_label ?? flag.flag_type,
  resolver_username: fact?.resolver_username ?? null,
  resolver_display_name: fact?.resolver_display_name ?? null,
})

export function attachReportIntegrityFlagLabels<T extends FlagIdentity>(
  flags: T[],
  query: QueryExecutor = read,
): Promise<Array<T & ReportFlagLabels>> {
  return attachIntegrityLabelRows<T, FlagLabelRow, ReportFlagLabels>(
    flags,
    ids => flagLabelQuery('report', ids),
    (fact, flag) => ({
      ...voteFacts(fact, flag),
      reported_username: fact?.reported_username ?? null,
    }),
    query,
  )
}

export function attachVoteIntegrityFlagLabels<T extends FlagIdentity>(
  flags: T[],
  query: QueryExecutor = read,
): Promise<Array<T & VoteFlagLabels>> {
  return attachIntegrityLabelRows<T, FlagLabelRow, VoteFlagLabels>(
    flags,
    ids => flagLabelQuery('vote', ids),
    voteFacts,
    query,
  )
}
