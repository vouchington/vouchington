import { write } from '@data-stores/psql'
import { v7 as uuidv7 } from 'uuid'
import sql from 'sql-template-strings'

type InsertTestModeratorActionOptions = {
  actorId: string | null
  actionType: string
  communityId?: string | null
  postId?: string | null
  targetUserId?: string | null
  reportId?: string | null
  reviewDisputeId?: string | null
  communityApplicationId?: string | null
  reason?: string | null
  metadata?: Record<string, unknown>
  occurredAt?: Date
  occurredAtSequence?: number
}

export async function insertTestModeratorAction(
  options: InsertTestModeratorActionOptions,
): Promise<{ id: string }> {
  const id = options.occurredAt
    ? uuidv7({ msecs: options.occurredAt.getTime(), seq: options.occurredAtSequence ?? 0 })
    : null
  const { rows } = await write(
    sql`/* insertTestModeratorAction */
    INSERT INTO moderator_actions (
      id,
      actor_id, action_type, community_id, post_id, target_user_id,
      report_id, review_dispute_id, community_application_id, reason, metadata
    ) VALUES (
      COALESCE(${id}::uuid, uuidv7()),
      ${options.actorId},
      ${options.actionType},
      ${options.communityId ?? null},
      ${options.postId ?? null},
      ${options.targetUserId ?? null},
      ${options.reportId ?? null},
      ${options.reviewDisputeId ?? null},
      ${options.communityApplicationId ?? null},
      ${options.reason ?? null},
      ${JSON.stringify(options.metadata ?? {})}
    )
    RETURNING id
    `,
  )
  return rows[0] as { id: string }
}

export async function deleteTestModeratorActions(actionIds: readonly string[]): Promise<void> {
  if (actionIds.length === 0) return
  await write(sql`/* deleteTestModeratorActions */
    DELETE FROM moderator_actions
    WHERE id = ANY(${actionIds}::uuid[])
  `)
}

/** Inserts one physical statement so rollup transition-table tests exercise batch ingestion. */
export async function insertTestModeratorActions(options: {
  actorId: string
  actionTypes: readonly string[]
  occurredAt: Date
  occurredAtSequenceStart: number
}): Promise<Array<{ id: string }>> {
  if (options.actionTypes.length === 0) return []
  const actionIds = options.actionTypes.map((_, index) =>
    uuidv7({ msecs: options.occurredAt.getTime(), seq: options.occurredAtSequenceStart + index }),
  )
  const { rows } = await write<{ id: string }>(sql`/* insertTestModeratorActions */
    INSERT INTO moderator_actions (id, actor_id, action_type, metadata)
    SELECT action_id, ${options.actorId}::uuid, action_type, '{}'::jsonb
    FROM unnest(${actionIds}::uuid[], ${options.actionTypes}::moderator_action_types[])
      AS input(action_id, action_type)
    RETURNING id
  `)
  return rows
}

/** Attempts an audit action reclassification for immutable-source regressions. */
export async function updateTestModeratorActionType(
  actionId: string,
  actionType: string,
): Promise<void> {
  await write(sql`/* updateTestModeratorActionType */
    UPDATE moderator_actions
    SET action_type = ${actionType}
    WHERE id = ${actionId}::uuid
  `)
}
