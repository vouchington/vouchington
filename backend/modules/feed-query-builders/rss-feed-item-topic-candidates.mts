import sql, { type SQLStatement } from 'sql-template-strings'
import { getEntityRelationTableNameOrThrow } from '@voucha/types/entities/entity-relations-metadata'

const RSS_FEED_ITEM_ID_COLUMN_PATTERN = /^[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*$/i

function assertSafeRssFeedItemIdColumn(rssFeedItemIdColumn: string): void {
  if (!RSS_FEED_ITEM_ID_COLUMN_PATTERN.test(rssFeedItemIdColumn)) {
    throw new Error(`Invalid rssFeedItemIdColumn format: ${rssFeedItemIdColumn}`)
  }
}

// RSS feed items have no shared entity-relation-table-name constants module analogous to
// `@voucha/types/entities/entity-relation-tables` (only 2 relation legs, only this one file
// consumes them), so the table names are derived inline here rather than hand-typed literals.
const RSS_FEED_ITEM_TOPIC_CATEGORY_RELATION_TABLE = getEntityRelationTableNameOrThrow({
  subjectType: 'rss_feed_item',
  objectType: 'topic',
  predicate: 'category',
})

const RSS_FEED_ITEM_TOPIC_ALIAS_CATEGORY_RELATION_TABLE = getEntityRelationTableNameOrThrow({
  subjectType: 'rss_feed_item',
  objectType: 'topic_alias',
  predicate: 'category',
})

/**
 * Single-topic candidate `rss_feed_item_id` derivation: every RSS feed item positively attached to
 * `topicId`, directly or through one of its hashtag aliases. Meant for a `FROM (…) candidate`
 * subselect — candidate-binding from this indexed topic side (instead of a per-row correlated
 * `EXISTS`) lets the planner drive the query from the topic's relation rows. Mirrors
 * `buildTopicPostCandidateSelect`'s shape from `topic-post-candidates.mts`; the RSS side reuses the
 * candidate-bind *pattern*, not that file's post-specific invariants (no shared table-name
 * constants module, no injection-guarded caller-supplied column, no 4-way "universal topic" union
 * — RSS has only 2 relation legs and 2 call sites, so those invariants don't apply here).
 */
export function buildRssFeedItemTopicCandidateSelect(topicId: string): SQLStatement {
  return sql`
    SELECT rel.subject_id AS rss_feed_item_id
    FROM `
    .append(RSS_FEED_ITEM_TOPIC_CATEGORY_RELATION_TABLE)
    .append(sql` rel
    WHERE rel.object_id = ${topicId}
      AND rel.deleted_at IS NULL
      AND rel.votes_score_net > 0

    UNION ALL

    SELECT alias_relation.subject_id AS rss_feed_item_id
    FROM topic_aliases alias
    JOIN `)
    .append(RSS_FEED_ITEM_TOPIC_ALIAS_CATEGORY_RELATION_TABLE).append(sql` alias_relation
      ON alias_relation.object_id = alias.id
     AND alias_relation.deleted_at IS NULL
     AND alias_relation.votes_score_net > 0
    WHERE alias.topic_id = ${topicId}
  `)
}

/**
 * Single-topic membership test: is the RSS feed item at `rssFeedItemIdColumn` positively attached
 * to `topicId`, directly or through one of its hashtag aliases? Uses a candidate-bind
 * `IN (SELECT candidate.rss_feed_item_id FROM (…) candidate)` shape built from
 * `buildRssFeedItemTopicCandidateSelect`, rather than a correlated `EXISTS (… UNION ALL …)`:
 * Postgres cannot pull a `UNION ALL` body into a semijoin, so the old shape materialized the full
 * candidate set once per outer row instead of once per query. See the doc comment on
 * `buildTopicMembershipExists` in `topic-post-candidates.mts` for the anti-pattern this avoids
 * (`no-mistakes`' `postgres-sql-shape-policy`, #11082).
 */
export function buildRssFeedItemTopicMembershipExists(
  rssFeedItemIdColumn: string,
  topicId: string,
): SQLStatement {
  assertSafeRssFeedItemIdColumn(rssFeedItemIdColumn)
  return sql``
    .append(rssFeedItemIdColumn)
    .append(sql` IN (
      SELECT candidate.rss_feed_item_id
      FROM (`)
    .append(buildRssFeedItemTopicCandidateSelect(topicId)).append(sql`) candidate
    )`)
}
