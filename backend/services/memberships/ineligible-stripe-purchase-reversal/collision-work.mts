import { registerPostCommitAction, write, type QueryExecutor } from '@data-stores/psql'
import { enqueueProcessStripePurchaseCollisionBestEffort } from '@queues/memberships/enqueues'
import sql from 'sql-template-strings'
import type { StripeMembershipSourceIdentity } from '../create-types.mts'
import { createProviderMembershipSource } from '../provider-source.mts'

type Collision = {
  userId: string
  sourceIdentity: StripeMembershipSourceIdentity
  winningSourceKind: 'direct' | 'family'
  winningPlan: 'plus' | 'pro'
  collisionAt: Date
}

export type StripePurchaseCollisionWork = Omit<Collision, 'userId'> & {
  id: string
  sourceId: string
  lineageId: string
  bindingId: string
}
type WorkRow = Omit<StripePurchaseCollisionWork, 'sourceIdentity'> & {
  environment: 'test' | 'production'
  applicationId: string
  providerLineageId: string
  providerAccountId: string | null
}

/** Captures the authorized source and immutable collision while the caller holds its user lock. */
export async function recordIneligibleStripePurchaseCollisionWork(
  options: Collision,
  query: QueryExecutor,
): Promise<string | null> {
  const source = await createProviderMembershipSource(
    {
      userId: options.userId,
      sourceKind: 'direct',
      sourceIdentity: options.sourceIdentity,
    },
    query,
  )
  const { rows } = await query<{ id: string }>(sql`/* recordIneligibleStripePurchaseCollisionWork */
    INSERT INTO membership_stripe_purchase_collision_work_items (
      membership_source_id, membership_provider_lineage_id, membership_lineage_binding_id,
      winning_source_kind, winning_plan, collision_at
    ) VALUES (
      ${source.id}, ${source.lineageId}, ${source.bindingId},
      ${options.winningSourceKind}, ${options.winningPlan}, ${options.collisionAt}
    )
    ON CONFLICT (membership_source_id, membership_provider_lineage_id,
      membership_lineage_binding_id, winning_source_kind, winning_plan, collision_at)
      DO NOTHING
    RETURNING id
  `)
  if (rows[0]) {
    registerPostCommitAction(query, async () => {
      await enqueueProcessStripePurchaseCollisionBestEffort({ workId: rows[0]!.id })
    })
    return rows[0].id
  }
  const existing = await query<{ id: string }>(sql`/* getExistingStripePurchaseCollisionWork */
    SELECT id FROM membership_stripe_purchase_collision_work_items
    WHERE membership_source_id = ${source.id}
      AND membership_provider_lineage_id = ${source.lineageId}
      AND membership_lineage_binding_id = ${source.bindingId}
      AND collision_at = ${options.collisionAt}
      AND winning_source_kind = ${options.winningSourceKind}
      AND winning_plan = ${options.winningPlan}
    LIMIT 1
  `)
  // The worker may finish and delete a conflicting row between these two statements.
  if (!existing.rows[0]) return null
  const workId = existing.rows[0].id
  registerPostCommitAction(query, async () => {
    await enqueueProcessStripePurchaseCollisionBestEffort({ workId })
  })
  return workId
}

export async function recordDisplacedStripePurchaseCollisionWork(
  options: Omit<Collision, 'sourceIdentity'>,
  query: QueryExecutor,
): Promise<string | null> {
  const { rows } = await query(buildGetDisplacedStripeSourceForCollisionQuery(options.userId))
  const displaced = rows[0] as
    | {
        environment: 'test' | 'production'
        applicationId: string
        subscriptionId: string
        customerId: string | null
      }
    | undefined
  if (!displaced) return null
  return recordIneligibleStripePurchaseCollisionWork(
    {
      ...options,
      sourceIdentity: {
        provider: 'stripe',
        environment: displaced.environment,
        applicationId: displaced.applicationId,
        providerLineageId: displaced.subscriptionId,
        providerAccountId: displaced.customerId,
      },
    },
    query,
  )
}

export function buildGetDisplacedStripeSourceForCollisionQuery(userId: string) {
  return sql`/* getDisplacedStripeSourceForCollision */
    SELECT context.environment, context.application_id AS "applicationId",
      lineage.provider_lineage_id AS "subscriptionId", lineage.provider_account_id AS "customerId"
    FROM memberships membership
    INNER JOIN membership_sources source ON source.id = membership.membership_source_id
    INNER JOIN membership_provider_lineages lineage ON lineage.id = source.membership_provider_lineage_id
    INNER JOIN membership_provider_contexts context ON context.id = lineage.membership_provider_context_id
    WHERE membership.user_id = ${userId}
      AND membership.projection_ended_at IS NULL
      AND membership.cancelled_at IS NULL AND membership.expired_at IS NULL
      AND membership.paused_at IS NULL
      AND source.source_kind = 'direct' AND context.provider = 'stripe'
    LIMIT 1
  `
}

export async function loadStripePurchaseCollisionWork(
  id: string,
): Promise<StripePurchaseCollisionWork | null> {
  const { rows } = await write<WorkRow>(sql`/* loadStripePurchaseCollisionWork */
    SELECT work.id, work.membership_source_id AS "sourceId",
      work.membership_provider_lineage_id AS "lineageId",
      work.membership_lineage_binding_id AS "bindingId",
      work.winning_source_kind AS "winningSourceKind", work.winning_plan AS "winningPlan",
      work.collision_at AS "collisionAt", context.environment,
      context.application_id AS "applicationId",
      lineage.provider_lineage_id AS "providerLineageId",
      lineage.provider_account_id AS "providerAccountId"
    FROM membership_stripe_purchase_collision_work_items work
    INNER JOIN membership_provider_lineages lineage ON lineage.id = work.membership_provider_lineage_id
    INNER JOIN membership_provider_contexts context ON context.id = lineage.membership_provider_context_id
    WHERE work.id = ${id} AND context.provider = 'stripe'
    LIMIT 1
  `)
  const row = rows[0]
  if (!row) return null
  const { environment, applicationId, providerLineageId, providerAccountId, ...work } = row
  return {
    ...work,
    sourceIdentity: {
      provider: 'stripe',
      environment,
      applicationId,
      providerLineageId,
      providerAccountId,
    },
  }
}

export async function findStripePurchaseCollisionWorkUpperBound(): Promise<string | null> {
  const { rows } = await write<{ id: string }>(sql`/* findStripePurchaseCollisionWorkUpperBound */
    SELECT id FROM membership_stripe_purchase_collision_work_items ORDER BY id DESC LIMIT 1
  `)
  return rows[0]?.id ?? null
}

export async function findStripePurchaseCollisionWorkIds(input: {
  after?: string
  through: string
  limit: number
}): Promise<string[]> {
  const { rows } = await write<{ id: string }>(sql`/* findStripePurchaseCollisionWorkIds */
    SELECT id FROM membership_stripe_purchase_collision_work_items
    WHERE id > ${input.after ?? '00000000-0000-0000-0000-000000000000'}::uuid
      AND id <= ${input.through}::uuid
    ORDER BY id LIMIT ${input.limit}
  `)
  return rows.map(row => row.id)
}

export async function completeStripePurchaseCollisionWork(
  id: string,
  query: QueryExecutor = write,
): Promise<void> {
  await query(sql`/* completeStripePurchaseCollisionWork */
    DELETE FROM membership_stripe_purchase_collision_work_items WHERE id = ${id}
  `)
}
