import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import { mapped } from './merge-reference-sql.mts'

export const relationReferences = {
  relation__community__mute__topic: ['object_id'],
  relation__post__category__topic: ['object_id'],
  relation__post__mentioned__topic: ['object_id'],
  relation__rss_feed_item__category__topic: ['object_id'],
  relation__topic__category__topic: ['object_id', 'subject_id'],
  relation__topic__faq__post: ['subject_id'],
  relation__topic__faq__url: ['subject_id'],
  relation__topic__guide__url: ['subject_id'],
  relation__topic__landing_page__url: ['subject_id'],
  relation__topic__mentioned__post: ['subject_id'],
  relation__topic__parent__topic: ['object_id', 'subject_id'],
  relation__topic__publisher_type__topic: ['object_id', 'subject_id'],
  relation__topic__related__post: ['subject_id'],
  relation__topic__related__topic: ['object_id', 'subject_id'],
  relation__topic__related__url: ['subject_id'],
  relation__topic__terms_of_service__url: ['subject_id'],
  relation__user__block__topic: ['object_id'],
  relation__user__category__topic: ['object_id'],
  relation__user__dismiss_recommendation__topic: ['object_id'],
  relation__user__follow__topic: ['object_id'],
  relation__user__mute__topic: ['object_id'],
  relation__user__subscribe_posts__topic: ['object_id'],
  relation__user__subscribe_rss_feed_items__topic: ['object_id'],
} as const

const relationElectionTables = new Set(
  entityRelationMetadatum.flatMap(metadata => (metadata.election ? [metadata.table_name] : [])),
)

export function buildTopicRelationMergeTargetsSql(): string {
  return Object.entries(relationReferences)
    .flatMap(([table, columns], index) => {
      const metadata = entityRelationMetadatum.find(relation => relation.table_name === table)!
      if (relationElectionTables.has(table))
        return [
          `SELECT DISTINCT 'election'::text AS kind, next_id AS entity_relation_id,
        old_id AS previous_relation_id, '${table}'::text AS relation_table,
        NULL::uuid AS subject_id, NULL::uuid AS object_id FROM r${index}_map`,
          ...(columns.length === 2
            ? [
                `SELECT 'election'::text AS kind, NULL::uuid AS entity_relation_id,
            id AS previous_relation_id, '${table}'::text AS relation_table,
            NULL::uuid AS subject_id, NULL::uuid AS object_id FROM r${index}_self_delete`,
              ]
            : []),
        ]
      if (metadata.is_bookmark && metadata.subject_type === 'user')
        return [
          `SELECT DISTINCT 'bookmark'::text AS kind, NULL::uuid AS entity_relation_id,
        NULL::uuid AS previous_relation_id, '${table}'::text AS relation_table,
        next_subject AS subject_id, next_object AS object_id FROM r${index}_map`,
        ]
      return []
    })
    .join(' UNION ALL ')
}

/** Historical flags cannot be dropped to satisfy the destination's pending-flag uniqueness. */
export function buildTopicRelationAuditConflictsSql(): string {
  return Object.entries(relationReferences)
    .flatMap(([table, columns]) => {
      if (!relationElectionTables.has(table)) return []
      const topicColumns: readonly string[] = columns
      const subject = topicColumns.includes('subject_id') ? mapped('r.subject_id') : 'r.subject_id'
      const object = topicColumns.includes('object_id') ? mapped('r.object_id') : 'r.object_id'
      const otherSubject = topicColumns.includes('subject_id')
        ? mapped('other.subject_id')
        : 'other.subject_id'
      const otherObject = topicColumns.includes('object_id')
        ? mapped('other.object_id')
        : 'other.object_id'
      return [
        `SELECT 'audit_flag' AS kind, source_flag.id AS source_id, destination_flag.id AS destination_id
      FROM ${table} r JOIN ${table} other ON ${otherSubject} = ${subject} AND ${otherObject} = ${object}
        AND other.id <> r.id
      JOIN vote_integrity_flags source_flag ON source_flag.${table}_subject_id = r.subject_id
        AND source_flag.${table}_id = r.id AND source_flag.resolved_at IS NULL
      JOIN vote_integrity_flags destination_flag ON destination_flag.${table}_subject_id = other.subject_id
        AND destination_flag.${table}_id = other.id AND destination_flag.resolved_at IS NULL
        AND destination_flag.flag_type = source_flag.flag_type
      WHERE ${columns.map(column => `r.${column} = $1::uuid`).join(' OR ')}`,
      ]
    })
    .join(' UNION ALL ')
}

/** Re-key ordered relation identities and their composite foreign keys in the same statement. */
export function buildTopicRelationMergeCtes(): string[] {
  return Object.entries(relationReferences).flatMap(([table, columns], index) => {
    const prefix = `r${index}`
    const subject = (columns as readonly string[]).includes('subject_id')
      ? mapped('s.subject_id')
      : 's.subject_id'
    const object = (columns as readonly string[]).includes('object_id')
      ? mapped('s.object_id')
      : 's.object_id'
    const source = columns.map(column => `s.${column} = $1::uuid`).join(' OR ')
    const hasVotes = relationElectionTables.has(table)
    const affected = columns
      .map(column => `s.${column} = ANY(ARRAY[$1::uuid, $2::uuid])`)
      .join(' OR ')
    const sourceCount = columns.map(column => `(s.${column} = $1::uuid)::int`).join(' + ')
    const mapCtes = [
      ...(columns.length === 2
        ? [
            `${prefix}_self_delete AS (
        DELETE FROM ${table} s WHERE (${source}) AND ${subject} = ${object} RETURNING ${hasVotes ? 's.id' : '1'}
      )`,
          ]
        : []),
      `${prefix}_ranked AS MATERIALIZED (
        SELECT s.*, ${subject} AS next_subject, ${object} AS next_object,
          (${source}) AS moving,
          row_number() OVER (PARTITION BY ${subject}, ${object} ORDER BY (s.deleted_at IS NULL) DESC, (${sourceCount}), ${hasVotes ? 's.id' : 's.subject_id, s.object_id'} DESC) AS priority
        FROM ${table} s WHERE (${affected}) ${columns.length === 2 ? `AND ${subject} <> ${object}` : ''}
      )`,
      `${prefix}_winner AS MATERIALIZED (
        SELECT *, ${hasVotes ? 'CASE WHEN moving THEN uuidv7() ELSE id END AS next_id' : '1 AS marker'}
        FROM ${prefix}_ranked WHERE priority = 1
      )`,
      `${prefix}_map AS MATERIALIZED (
        SELECT ${hasVotes ? 's.id AS old_id,' : ''} s.subject_id AS old_subject, s.object_id AS old_object,
          w.next_subject, w.next_object, ${hasVotes ? 'w.next_id,' : ''} s.priority > 1 AS collision
        FROM ${prefix}_ranked s JOIN ${prefix}_winner w USING (next_subject, next_object)
        WHERE s.moving OR s.priority > 1
      )`,
    ]
    if (!hasVotes)
      return [
        ...mapCtes,
        `${prefix}_delete AS (DELETE FROM ${table} s USING ${prefix}_map m
        WHERE s.subject_id = m.old_subject AND s.object_id = m.old_object AND m.collision RETURNING 1)`,
        `${prefix}_update AS (UPDATE ${table} s SET subject_id = m.next_subject, object_id = m.next_object
        FROM ${prefix}_map m WHERE s.subject_id = m.old_subject AND s.object_id = m.old_object
          AND NOT m.collision AND (SELECT count(*) FROM ${prefix}_delete) >= 0 RETURNING 1)`,
      ]
    return [
      ...mapCtes,
      `${prefix}_votes_keep AS MATERIALIZED (
        SELECT DISTINCT ON (w.next_id, v.user_id) w.next_id, v.user_id, r.id AS old_relation
        FROM ${prefix}_ranked r JOIN ${prefix}_winner w USING (next_subject, next_object)
        JOIN ${table}__votes v ON v.entity_relation_id = r.id AND v.subject_id = r.subject_id
        ORDER BY w.next_id, v.user_id, r.priority, v.id DESC
      )`,
      `${prefix}_votes_delete AS (
        DELETE FROM ${table}__votes v USING ${prefix}_map m
        WHERE v.entity_relation_id = m.old_id AND v.subject_id = m.old_subject
          AND EXISTS (SELECT 1 FROM ${prefix}_votes_keep k
            WHERE k.next_id = m.next_id AND k.user_id = v.user_id AND k.old_relation <> m.old_id)
        RETURNING v.id
      )`,
      `${prefix}_votes_update AS (
        UPDATE ${table}__votes v SET entity_relation_id = m.next_id, subject_id = m.next_subject
        FROM ${prefix}_map m
        WHERE v.entity_relation_id = m.old_id AND v.subject_id = m.old_subject
          AND (SELECT count(*) FROM ${prefix}_votes_delete) >= 0
          AND EXISTS (SELECT 1 FROM ${prefix}_votes_keep k
            WHERE k.next_id = m.next_id AND k.user_id = v.user_id AND k.old_relation = m.old_id)
        RETURNING v.id
      )`,
      `${prefix}_flags_update AS (
        UPDATE vote_integrity_flags f SET ${table}_id = m.next_id,
          ${table}_subject_id = m.next_subject
        FROM ${prefix}_map m WHERE f.${table}_id = m.old_id
          AND f.${table}_subject_id = m.old_subject RETURNING f.id
      )`,
      `${prefix}_delete AS (
        DELETE FROM ${table} s USING ${prefix}_map m
        WHERE s.id = m.old_id AND s.subject_id = m.old_subject AND m.collision
          AND (SELECT count(*) FROM ${prefix}_votes_update) >= 0
          AND (SELECT count(*) FROM ${prefix}_flags_update) >= 0
        RETURNING s.id
      )`,
      `${prefix}_update AS (
        UPDATE ${table} s SET id = m.next_id, subject_id = m.next_subject, object_id = m.next_object
        FROM ${prefix}_map m WHERE s.id = m.old_id AND s.subject_id = m.old_subject
          AND NOT m.collision AND (SELECT count(*) FROM ${prefix}_delete) >= 0
          AND (SELECT count(*) FROM ${prefix}_votes_update) >= 0
          AND (SELECT count(*) FROM ${prefix}_flags_update) >= 0 RETURNING s.id
      )`,
    ]
  })
}
