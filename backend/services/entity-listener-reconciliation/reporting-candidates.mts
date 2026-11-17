import sql from 'sql-template-strings'
import { getMinUuidv7ForDate } from '@modules/utils'
import type { EntityReconciliationWindow, EntityReconciliationCandidate } from './types.mts'

export function reportingCandidateUnion(
  window: EntityReconciliationWindow,
  after: EntityReconciliationCandidate | undefined,
  maxRows: number,
) {
  const firstRevisionId = getMinUuidv7ForDate(window.start)
  const afterLastRevisionId = getMinUuidv7ForDate(new Date(window.end.getTime() + 1))
  return sql`
        UNION ALL
        (SELECT * FROM (
        SELECT 'reporting_growth'::text, (created_at AT TIME ZONE 'UTC')::date::text,
          floor(extract(epoch FROM updated_at) * 1000000)::text, id::text, NULL::jsonb, updated_at
        FROM users WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'reporting_growth'::text, (created_at AT TIME ZONE 'UTC')::date::text,
          floor(extract(epoch FROM updated_at) * 1000000)::text, id::text, NULL::jsonb, updated_at
        FROM posts WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'reporting_growth'::text, (created_at AT TIME ZONE 'UTC')::date::text,
          floor(extract(epoch FROM created_at) * 1000000)::text, (subject_id::text || ':' || object_id::text), NULL::jsonb, created_at
        FROM relation__user__follow__user WHERE created_at >= ${window.start} AND created_at <= ${window.end}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'reporting_growth'::text, (created_at AT TIME ZONE 'UTC')::date::text,
          floor(extract(epoch FROM created_at) * 1000000)::text, id::text, NULL::jsonb, created_at
        FROM post_votes WHERE id >= ${firstRevisionId} AND id < ${afterLastRevisionId}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT 'reporting_workload'::text, (created_at AT TIME ZONE 'UTC')::date::text,
          floor(extract(epoch FROM created_at) * 1000000)::text, id::text, NULL::jsonb, created_at
        FROM moderator_actions WHERE id >= ${firstRevisionId} AND id < ${afterLastRevisionId}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${maxRows + 1})
        UNION ALL
        (SELECT * FROM (
        SELECT CASE WHEN source_type IN ('moderator_action_deletion', 'moderator_action_creation') THEN 'reporting_workload' ELSE 'reporting_growth' END,
          source_on::text, floor(extract(epoch FROM occurred_at) * 1000000)::text,
          id::text, NULL::jsonb, occurred_at
        FROM reporting_source_day_events WHERE id >= ${firstRevisionId} AND id < ${afterLastRevisionId}
        ) repair_source(entity_type, entity_id, changed_at_epoch_us, change_id, details, changed_at)
        WHERE (changed_at, entity_id, entity_type, change_id IS NULL, COALESCE(change_id, '')) > (COALESCE(to_timestamp(floor(${after?.changedAtEpochUs ?? null}::numeric / 1000000)::double precision) + (${after?.changedAtEpochUs ?? null}::numeric % 1000000)::double precision * INTERVAL '1 microsecond', '-infinity'::timestamptz), ${after?.entityId ?? ''}::text, ${after?.entityType ?? ''}::text, ${after?.changeId === undefined}, ${after?.changeId ?? ''}::text)
        ORDER BY changed_at, entity_id, change_id
        LIMIT ${maxRows + 1})
`
}
