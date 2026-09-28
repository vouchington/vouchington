import { assertWhitelistedSqlIdentifier, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { ENTITY_TYPE_TO_FLAG_FK } from './config.mts'
import createHttpError from 'http-errors'
import type {
  VoteIntegrityFlagType,
  VoteIntegrityResolution,
} from '@ts-shared/utils/moderation-catalogs'
import { voteDetailFacts } from './vote-detail-facts.mts'
import { VOTE_INTEGRITY_FLAG_PROJECTION, voteIntegrityRelationTargets } from './flag-projection.mts'
import { getEntityRelationIntegritySubjectColumn } from '@voucha/types/entities/entity-relations-metadata'

export type VoteIntegrityFlag = {
  id: string
  post_id: string | null
  topic_id: string | null
  hostname_id: string | null
  rss_feed_item_id: string | null
  entity_relation_id: string | null
  agent_moderation_id: string | null
  flag_type: VoteIntegrityFlagType
  details: Record<string, unknown>
  resolved_at: Date | null
  resolved_by_id: string | null
  resolution: VoteIntegrityResolution | null
  created_at: Date
}

const relationTables = new Set(
  voteIntegrityRelationTargets.map(target => target.metadata.table_name),
)

export async function createVoteIntegrityFlag(
  entityType: string,
  entityId: string,
  flagType: VoteIntegrityFlagType,
  details: Record<string, unknown>,
): Promise<VoteIntegrityFlag | null> {
  if (entityType === 'entity_relation') {
    return createEntityRelationVoteIntegrityFlag(entityId, flagType, details)
  }
  if (entityType === 'agent_moderation') {
    return createAgentModerationVoteIntegrityFlag(entityId, flagType, details)
  }

  const fkColumn = ENTITY_TYPE_TO_FLAG_FK[entityType]
  if (!fkColumn) throw createHttpError(400, `Unknown entity type: ${entityType}`)

  const query = sql`/* createVoteIntegrityFlag */
    INSERT INTO vote_integrity_flags (`
  query.append(fkColumn)
  const facts = voteDetailFacts(details)
  query.append(sql`, flag_type, young_account_vote_count, detail_threshold, detail_window_minutes, young_account_age_days)
    VALUES (
      ${entityId}::uuid,
      ${flagType},
      ${facts.youngAccountVoteCount},
      ${facts.threshold},
      ${facts.windowMinutes},
      ${facts.youngAccountAgeDays}
    )
    /* no-mistakes: deadlock-safe -- this direct entity insert has one source row; its populated FK selects one pending-flag partial index. */
    ON CONFLICT DO NOTHING
    RETURNING id`)

  return finishVoteIntegrityFlag(query, facts.ips)
}

async function createAgentModerationVoteIntegrityFlag(
  entityId: string,
  flagType: VoteIntegrityFlagType,
  details: Record<string, unknown>,
): Promise<VoteIntegrityFlag | null> {
  const facts = voteDetailFacts(details)
  const query = sql`/* createAgentModerationVoteIntegrityFlag */
    INSERT INTO vote_integrity_flags (
      agent_moderation_post_id, agent_moderation_id, flag_type,
      young_account_vote_count, detail_threshold, detail_window_minutes, young_account_age_days
    )
    SELECT post_id, id, ${flagType},
      ${facts.youngAccountVoteCount}, ${facts.threshold}, ${facts.windowMinutes}, ${facts.youngAccountAgeDays}
    FROM agent_moderations
    WHERE id = ${entityId}::uuid
      AND deleted_at IS NULL
    /* no-mistakes: deadlock-safe -- agent_moderations.id is a one-row primary-key lookup; populated columns select one pending-flag partial index. */
    ON CONFLICT DO NOTHING
    RETURNING id`
  return finishVoteIntegrityFlag(query, facts.ips)
}

async function createEntityRelationVoteIntegrityFlag(
  entityId: string,
  flagType: VoteIntegrityFlagType,
  details: Record<string, unknown>,
): Promise<VoteIntegrityFlag | null> {
  const targetColumns = voteIntegrityRelationTargets.flatMap(target => [
    getEntityRelationIntegritySubjectColumn(target.metadata),
    target.targetColumn,
  ])
  const query = sql`/* createEntityRelationVoteIntegrityFlag */
    WITH matched_relation AS (`
  voteIntegrityRelationTargets.forEach((target, index) => {
    if (index > 0) query.append(sql` UNION ALL `)
    query.append(`SELECT ${index}::integer AS relation_index, subject_id, id
      FROM `)
    query.append(
      assertWhitelistedSqlIdentifier(
        target.metadata.table_name,
        relationTables,
        'entityRelationTable',
      ),
    )
    query.append(sql`
      WHERE id = ${entityId}::uuid
        AND deleted_at IS NULL`)
  })
  query.append(sql`)
    INSERT INTO vote_integrity_flags (`)
  query.append(targetColumns.join(', '))
  const facts = voteDetailFacts(details)
  query.append(sql`, flag_type, young_account_vote_count, detail_threshold, detail_window_minutes, young_account_age_days)
    SELECT `)
  voteIntegrityRelationTargets.forEach((_target, index) => {
    if (index > 0) query.append(', ')
    query.append(`CASE WHEN relation_index = ${index} THEN subject_id END, `)
    query.append(`CASE WHEN relation_index = ${index} THEN id END`)
  })
  query.append(sql`, ${flagType}, ${facts.youngAccountVoteCount}, ${facts.threshold}, ${facts.windowMinutes}, ${facts.youngAccountAgeDays}
    FROM matched_relation
    ORDER BY relation_index, subject_id, id
    /* no-mistakes: deadlock-safe -- relation_index is the stable relation catalog order; each row populates only its relation-specific pending-flag partial index. */
    ON CONFLICT DO NOTHING
    RETURNING id`)
  return finishVoteIntegrityFlag(query, facts.ips)
}

async function finishVoteIntegrityFlag(
  query: ReturnType<typeof sql>,
  ips: Array<{ ipAddress: string; distinctUserCount: number }>,
): Promise<VoteIntegrityFlag | null> {
  const { rows } = await write<{ id: string }>(query)
  const flagId = rows[0]?.id
  if (!flagId) return null
  if (ips.length > 0) {
    await write(sql`/* createVoteIntegrityFlagIps */
      INSERT INTO vote_integrity_flag_ips (flag_id, position, ip_address, distinct_user_count)
      SELECT ${flagId}::uuid, item.position::integer - 1, item.ip_address, item.distinct_user_count
      FROM UNNEST(
        ${ips.map(ip => ip.ipAddress)}::text[],
        ${ips.map(ip => ip.distinctUserCount)}::integer[]
      ) WITH ORDINALITY AS item(ip_address, distinct_user_count, position)
    `)
  }
  const loaded = sql`/* loadVoteIntegrityFlag */
    SELECT `
  loaded.append(VOTE_INTEGRITY_FLAG_PROJECTION)
  loaded.append(sql` FROM vote_integrity_flags WHERE id = ${flagId}`)
  const { rows: flags } = await write(loaded)
  return (flags[0] as VoteIntegrityFlag | undefined) ?? null
}
