import { createAsyncGeneratorFromCursor } from '@data-stores/psql'
import type { getEntityReconciliationLimits } from './work-limits.mts'
import type { CursorRunResult } from '@data-stores/psql/bounded-cursor-api'
import sql from 'sql-template-strings'
import { getMinUUIDv7ForDate } from '@modules/utils'
import type {
  EntityReconciliationWindow,
  EntityReconciliationCandidate,
} from './reconciliation.mts'

export function streamEntityReconciliationRows(
  window: EntityReconciliationWindow,
  options: {
    after?: EntityReconciliationCandidate
    limits: ReturnType<typeof getEntityReconciliationLimits>
    onComplete?: (result: Pick<CursorRunResult<unknown>, 'rowsRead' | 'hasMore'>) => void
  },
) {
  const after = options.after
  const firstRevisionId = getMinUUIDv7ForDate(window.start)
  const afterLastRevisionId = getMinUUIDv7ForDate(new Date(window.end.getTime() + 1))
  return createAsyncGeneratorFromCursor<{
    entity_type: EntityReconciliationCandidate['entityType']
    entity_id: string
    changed_at_epoch_us: string
    change_id: string | null
    details: Record<string, unknown> | null
  }>(
    sql`/* streamEntityReconciliationCandidateBatches */
      SELECT entity_type, entity_id, changed_at_epoch_us, change_id, details
      FROM (
        (SELECT * FROM (
        SELECT 'user'::text AS entity_type, id::text AS entity_id,
          floor(extract(epoch FROM updated_at) * 1000000)::text AS changed_at_epoch_us,
          NULL::text AS change_id,
          jsonb_build_object('referrerId', referrer_user_id,
            'createdInWindow', id >= ${firstRevisionId} AND id < ${afterLastRevisionId}) AS details,
          updated_at AS changed_at
        FROM users
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end} AND deleted_at IS NULL
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'topic', id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM topics
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
          AND deleted_at IS NULL AND merged_into_topic_id IS NULL
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT CASE revision_type
            WHEN 'create' THEN 'post_created'
            WHEN 'update' THEN 'post_updated'
            WHEN 'delete' THEN 'post_deleted'
          END,
          post_id::text,
          floor(extract(epoch FROM created_at) * 1000000)::text,
          id::text, jsonb_build_object('changes', changes), created_at
        FROM post_revisions
        WHERE id >= ${firstRevisionId} AND id < ${afterLastRevisionId}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'image', id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM images
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
          AND deleted_at IS NULL AND upload_completed_at IS NOT NULL
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'url', id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM urls
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'community', id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM communities
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end} AND deleted_at IS NULL
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'rss_feed_item', id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM rss_feed_items
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end} AND deleted_at IS NULL
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'api_key', id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM api_keys
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end} AND revoked_at IS NULL
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'blocklisted_domain', domain, floor(extract(epoch FROM updated_at) * 1000000)::text,
          source_id::text, NULL::jsonb, updated_at
        FROM blocklisted_domains
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'embedding', encode(content_sha256, 'hex'), floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM bedrock_nova_multimodal_v1_embeddings
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'post_slug', post_id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          slug, NULL::jsonb, updated_at
        FROM post_slugs
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'url_hostname', id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM url_hostnames
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
          AND is_blocked
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'url_hostname', id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM url_hostnames
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
          AND NOT is_crawlable AND NOT is_blocked
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'topic_alias', id::text, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::text, NULL::jsonb, updated_at
        FROM topic_aliases
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${options.limits.maxRows + 1})
      ) candidates

      ORDER BY changed_at, entity_id, entity_type, change_id
    `,
    {
      batchSize: options.limits.batchSize,
      maxRows: options.limits.maxRows,
      onComplete: options.onComplete,
    },
  )
}
