import { expect } from 'vitest'
import { getCopyrightNoticePrivateAggregate } from './services/copyright-notices/private-aggregate.mts'
import {
  assertSurfaceLifecycleWithhold,
  assertSurfaceLifecycleRestore,
} from './copyright-surface-lifecycle-subjects.mts'
import { seedRestorationSceneWithhold } from './copyright-withhold-scene-fixture.mts'
import { seedCompletedReversalStatement } from './copyright-restored-statement-fixture.mts'
import {
  seedCommittedTerritorialRedress,
  seedCommittedTerritorialRedressDecision,
} from './copyright-territorial-committed-redress.mts'
import { getImagePlacementForCopyright } from '../services/images/placements.mts'
import type { PrivateUser } from '../services/users/types.mts'

async function owner(noticeId: string, posterId: string) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const restriction = aggregate?.restrictions[0]
  const target = aggregate?.targets.find(row => row.id === restriction?.copyright_notice_target_id)
  if (!aggregate || !restriction || !target)
    throw new Error('Owned single-image withdrawal action lost its authority')
  return {
    aggregate,
    fixture: {
      placementId: target.placement_id,
      actorUserId: posterId,
      ownerKind: 'post' as const,
    },
    record: { noticeId, restrictionId: restriction.id },
  }
}

/** Reviewed job stage oracles preserve every native-abort boundary without invoking a worker twice. */
export async function assertWithdrawalWithhold(noticeId: string, posterId: string) {
  const input = await owner(noticeId, posterId)
  const intent = input.aggregate.actionIntents.find(row => row.action === 'withhold')
  if (!intent) throw new Error('Owned withdrawal withhold is missing')
  await assertSurfaceLifecycleWithhold(input.fixture, {
    ...input.record,
    withholdIntentId: intent.id,
  })
}

export async function assertWithdrawalRestore(noticeId: string, posterId: string) {
  const input = await owner(noticeId, posterId)
  const intent = input.aggregate.actionIntents.find(row => row.action === 'restore')
  if (!intent) throw new Error('Owned withdrawal restore is missing')
  await assertSurfaceLifecycleRestore(input.fixture, input.record, intent.id)
}

/** A separate complete delivered scene supports unconditional positive state/visibility reads. */
export async function seedCompletedWithdrawalRestoration(
  jurisdiction: 'eu_dsa' | 'uk',
  noticeId: string,
  claimant: PrivateUser,
  staff: PrivateUser,
) {
  const aggregate = await getCopyrightNoticePrivateAggregate(noticeId)
  const withhold = aggregate?.actionIntents.find(row => row.action === 'withhold')
  if (!withhold) throw new Error('Independent committed withhold is missing')
  await seedRestorationSceneWithhold(withhold.id)
  const complaint = await seedCommittedTerritorialRedress(
    jurisdiction,
    noticeId,
    claimant,
    'The restriction should be reversed.',
  )
  await seedCommittedTerritorialRedressDecision(jurisdiction, noticeId, complaint.id, staff, {
    disposition: 'revoke',
    rationale: 'The restriction is reversed after complaint review.',
  })
  const reversed = await getCopyrightNoticePrivateAggregate(noticeId)
  const restore = reversed?.actionIntents.find(row => row.action === 'restore')
  if (!restore) throw new Error('Independent committed restore is missing')
  await seedCompletedReversalStatement(restore.id)
}

export async function assertCompletedWithdrawalRestoration(noticeId: string, posterId: string) {
  const input = await owner(noticeId, posterId)
  expect(input.aggregate.restrictions[0]?.lifted_at).toBeInstanceOf(Date)
  expect(input.aggregate.actionIntents.find(row => row.action === 'restore')).toMatchObject({
    state: 'completed',
  })
  expect(await getImagePlacementForCopyright(input.fixture.placementId)).toMatchObject({
    withheld: false,
  })
}
