import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import { beginTransaction } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  getImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
} from '../services/images/placements.mts'
import { stageImagePlacementDeliveryRecord } from '../services/media-delivery-safety/index.mts'
import {
  authorizeRestoreBeforeDelivery,
  completeUnavailableRestore,
} from '../services/copyright-notices/action-delivery-restore.mts'
import { lockCopyrightActionDelivery } from '../services/copyright-notices/action-delivery-locking.mts'
import { seedCopyrightStatementRestriction } from './copyright-statement-restriction-fixture.mts'
import type { openHeldCounterNoticeRestore } from './copyright-restoration-hold-scene.mts'
import type { acceptCopyrightNoticeAndImposeRestriction } from '../services/copyright-notices/restrictions.mts'

export type ActionDeliveryScene = Awaited<ReturnType<typeof openHeldCounterNoticeRestore>>

/** An imposition dependency commits all notices, action, incident and staydown effects in RC. */
export async function seedActionDeliveryRestriction(
  input: Parameters<typeof acceptCopyrightNoticeAndImposeRestriction>[0],
) {
  const aggregate = await getCopyrightNoticePrivateAggregate(input.noticeId)
  const target = aggregate?.targets.find(row => row.id === input.targetId)
  if (!target) throw new Error('Owned delivery target disappeared')
  return seedCopyrightStatementRestriction({
    noticeId: input.noticeId,
    targetId: input.targetId,
    assessmentId: input.assessmentId,
    revision: target.placement_revision,
    moderatorId: input.imposedById!,
    imposedAt: input.imposedAt,
  })
}

/** Canonical lease state for independent preparation/finalization subjects, never a worker retry. */
export async function claimActionDeliveryFixture(
  intentId: string,
  query: Awaited<ReturnType<typeof beginTransaction>>,
) {
  const { rows } = await query<{ lease_token: string }>(sql`/* claimActionDeliveryFixture */
    UPDATE copyright_notice_action_work_items SET lease_token = uuidv7(), attempt_count = 1,
      leased_at = clock_timestamp(), lease_expires_at = clock_timestamp() + INTERVAL '5 minutes',
      available_at = clock_timestamp(), failure_message = NULL
    WHERE id = ${intentId} AND state = 'pending' RETURNING lease_token`)
  const lease = rows[0]?.lease_token
  if (!lease) throw new Error('Owned action fixture was not pending')
  const legal = await lockCopyrightActionDelivery(intentId, lease, query)
  if (!legal) throw new Error('Owned action fixture authority disappeared')
  return legal
}

/** Full committed preparation precedes the actual publication/authority subject unconditionally. */
export async function prepareActionDeliveryRestore(scene: ActionDeliveryScene) {
  await using query = await beginTransaction()
  const legal = await claimActionDeliveryFixture(scene.restore.id, query)
  const mutation = await restoreImagePlacementForCopyright(
    { placementId: legal.placement_id, expectedRevision: legal.expected_placement_revision },
    { query },
  )
  if (mutation.status !== 'applied')
    throw new Error(`Owned restore preparation was ${mutation.status}`)
  await authorizeRestoreBeforeDelivery({
    legal,
    intentId: scene.restore.id,
    now: scene.restorationAt,
    query,
  })
  const tuple = {
    placementId: mutation.placement.placementId,
    revision: mutation.placement.revision,
    imageId: mutation.placement.imageId,
  }
  const staged = await stageImagePlacementDeliveryRecord({ ...tuple, state: 'allow' }, { query })
  await query.commit()
  return { ...tuple, ...staged, legal }
}

/** A completed unavailable resolution is the independent no-duplicate statement replay input. */
export async function seedUnavailableActionDelivery(scene: ActionDeliveryScene) {
  await using query = await beginTransaction()
  const legal = await claimActionDeliveryFixture(scene.restore.id, query)
  await completeUnavailableRestore({
    intentId: scene.restore.id,
    legal,
    now: scene.restorationAt,
    query,
  })
  await query.commit()
}

export async function actionDeliveryCurrentTuple(placementId: string) {
  const current = await getImagePlacementForCopyright(placementId)
  if (!current) throw new Error('Owned delivery placement disappeared')
  return { placementId: current.placementId, revision: current.revision, imageId: current.imageId }
}
