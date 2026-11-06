import type { QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { MembershipPlanSlug } from '../types.mts'

export type QualifyingStripeCollision = {
  winningSourceKind: 'direct' | 'family'
  winningPlan: MembershipPlanSlug
  collisionAt: Date
}

type CollisionRow = QualifyingStripeCollision & { purchasePlan: MembershipPlanSlug }

type QualifyingStripeCollisionLane = {
  purchasePlan: MembershipPlanSlug
  winningSourceKind: 'direct' | 'family'
  winningPlan: MembershipPlanSlug
}

/** Enumerate only lanes that can displace each purchased plan. */
export function getQualifyingStripeCollisionLanes(
  purchasePlans: readonly MembershipPlanSlug[],
): QualifyingStripeCollisionLane[] {
  return [...new Set(purchasePlans)].flatMap(purchasePlan => {
    const lanes: QualifyingStripeCollisionLane[] = [
      { purchasePlan, winningSourceKind: 'direct', winningPlan: 'plus' },
      { purchasePlan, winningSourceKind: 'direct', winningPlan: 'pro' },
      { purchasePlan, winningSourceKind: 'family', winningPlan: 'pro' },
    ]
    if (purchasePlan === 'plus')
      lanes.push({ purchasePlan, winningSourceKind: 'family', winningPlan: 'plus' })
    return lanes
  })
}

/** At most four first rows per purchase plan preserve committed pending collision order. */
export async function getEarliestCapturedStripeCollisions(
  source: { sourceId: string; lineageId: string; bindingId: string },
  purchasePlans: readonly MembershipPlanSlug[],
  query: QueryExecutor,
): Promise<Map<MembershipPlanSlug, QualifyingStripeCollision>> {
  if (purchasePlans.length === 0) return new Map()
  const { rows } = await query<CollisionRow>(
    buildGetEarliestCapturedStripeCollisionsQuery(source, purchasePlans),
  )
  return new Map(rows.map(({ purchasePlan, ...collision }) => [purchasePlan, collision]))
}

export function buildGetEarliestCapturedStripeCollisionsQuery(
  source: { sourceId: string; lineageId: string; bindingId: string },
  purchasePlans: readonly MembershipPlanSlug[],
) {
  const lanes = getQualifyingStripeCollisionLanes(purchasePlans)
  return sql`/* getEarliestCapturedStripeCollisions */
    WITH candidates AS (
      SELECT lane.purchase_plan AS "purchasePlan",
        collision.winning_source_kind AS "winningSourceKind",
        collision.winning_plan AS "winningPlan",
        collision.collision_at AS "collisionAt"
      FROM UNNEST(
        ${lanes.map(lane => lane.purchasePlan)}::membership_plan_slugs[],
        ${lanes.map(lane => lane.winningSourceKind)}::membership_source_kinds[],
        ${lanes.map(lane => lane.winningPlan)}::membership_plan_slugs[]
      ) AS lane(purchase_plan, source_kind, plan)
      CROSS JOIN LATERAL (
        SELECT work.winning_source_kind, work.winning_plan, work.collision_at
        FROM membership_stripe_purchase_collision_work_items work
        WHERE work.membership_source_id = ${source.sourceId}
          AND work.membership_provider_lineage_id = ${source.lineageId}
          AND work.membership_lineage_binding_id = ${source.bindingId}
          AND work.winning_source_kind = lane.source_kind
          AND work.winning_plan = lane.plan
        ORDER BY work.collision_at LIMIT 1
      ) collision
    )
    SELECT DISTINCT ON ("purchasePlan") "purchasePlan", "winningSourceKind",
      "winningPlan", "collisionAt"
    FROM candidates
    ORDER BY "purchasePlan", "collisionAt", "winningSourceKind", "winningPlan"
  `
}

/** Preserve the earliest applicable committed capture or current winner. */
export function chooseEarliestQualifyingStripeCollision(
  captured: QualifyingStripeCollision | undefined,
  current: QualifyingStripeCollision | null,
  purchasePlan: MembershipPlanSlug,
): QualifyingStripeCollision | null {
  const currentQualifies =
    current &&
    (current.winningSourceKind === 'direct' ||
      purchasePlan === 'plus' ||
      current.winningPlan === 'pro')
      ? current
      : null
  if (!captured) return currentQualifies
  if (!currentQualifies) return captured
  return captured.collisionAt <= currentQualifies.collisionAt ? captured : currentQualifies
}
