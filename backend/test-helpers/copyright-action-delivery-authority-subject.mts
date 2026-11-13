import { expect } from 'vitest'
import { beginTransaction } from '@data-stores/psql'
import { processCopyrightActionIntent } from '../services/copyright-notices/action-delivery-process.mts'
import { withholdImagePlacementForCopyright } from '../services/images/placements.mts'
import {
  prepublishImagePlacementDenial,
  publishStagedMediaDeliveryRecord,
} from '../services/media-delivery-safety/index.mts'
import { appendTestCopyrightNoticeSubmission } from './copyright-notice-submissions.mts'
import {
  copyrightRaceResult,
  nativeCopyrightSerializationConflict,
} from './copyright-assessment-race-outcomes.mts'
import {
  readDeliveryContractState,
  claimedDeliveryState,
  preparedDeliveryState,
  terminalDeliveryState,
  type DeliveryContractState,
} from './copyright-action-delivery-contract-state.mts'
import {
  actionDeliveryCurrentTuple,
  type ActionDeliveryScene,
} from './copyright-action-delivery-contract-fixtures.mts'

export function actionDeliveryOwner(scene: ActionDeliveryScene) {
  return {
    noticeId: scene.notice.id,
    restrictionId: scene.restriction.id,
    placementId: scene.target.placement_id,
    accountId: scene.claimant.id,
  }
}

/** This fixture change commits on its own; the following publication is always the actual guard. */
export async function changePreparedActionAuthority(
  scene: ActionDeliveryScene,
  kind: 'withhold' | 'court',
) {
  const tuple = await actionDeliveryCurrentTuple(scene.target.placement_id)
  if (kind === 'withhold') {
    await using query = await beginTransaction()
    await prepublishImagePlacementDenial(tuple, { query })
    const mutation = await withholdImagePlacementForCopyright(
      { placementId: tuple.placementId, expectedRevision: tuple.revision },
      { query },
    )
    expect(mutation.status).toBe('applied')
    await query.commit()
    return null
  }
  const submission = await appendTestCopyrightNoticeSubmission({
    noticeId: scene.notice.id,
    kind: 'court_or_ccb_hold',
    receivedAt: scene.restorationAt,
    sourceKind: 'email',
    submittedByUserId: null,
    bodyCiphertext: `late-filing-${crypto.randomUUID()}`,
  })
  return submission.id
}

export function authorityChangedState(
  before: DeliveryContractState,
  kind: 'withhold' | 'court',
  submissionId: string | null,
): DeliveryContractState {
  return {
    ...before,
    physical:
      kind === 'withhold'
        ? { withheld: true, revision: before.physical.revision + 1 }
        : before.physical,
    state:
      kind === 'court'
        ? {
            ...before.state,
            pointers: [
              ...before.state.pointers,
              { id: submissionId!, assessment: null, compliant: null },
            ].toSorted((a, b) => a.id.localeCompare(b.id)),
          }
        : before.state,
    registry: before.registry.map(row =>
      row.revision === before.physical.revision
        ? { ...row, desired: 'withheld', state: 'completed' }
        : row,
    ),
  }
}

/** Run the whole job once; a pre-publication SSI abort cannot stand in for the independent guard tests. */
export async function assertActionAuthorityJob(
  scene: ActionDeliveryScene,
  kind: 'withhold' | 'court',
) {
  const owner = actionDeliveryOwner(scene)
  const before = await readDeliveryContractState(owner)
  const claimed = claimedDeliveryState(before, scene.restore.id)
  const prepared = preparedDeliveryState(claimed, {
    intentId: scene.restore.id,
    restrictionId: scene.restriction.id,
    now: scene.restorationAt,
  })
  let publication = false
  let guarded: DeliveryContractState | undefined
  const [result] = await Promise.allSettled([
    processCopyrightActionIntent(scene.restore.id, scene.restorationAt, {
      publishStagedMediaDeliveryRecord: async id => {
        publication = true
        expect(await readDeliveryContractState(owner)).toEqual(prepared)
        const filing = await changePreparedActionAuthority(scene, kind)
        guarded = authorityChangedState(prepared, kind, filing)
        await publishStagedMediaDeliveryRecord(id)
        expect(await readDeliveryContractState(owner)).toEqual(guarded)
      },
    }),
  ])
  const success = guarded
    ? terminalDeliveryState(
        guarded,
        scene.restore.id,
        kind === 'court' ? 'blocked' : 'stale',
        kind === 'court'
          ? 'A current copyright blocker was admitted before restore delivery completed.'
          : 'Placement changed while its exact delivery tuple was being projected.',
      )
    : undefined
  expect([
    { outcome: nativeCopyrightSerializationConflict, state: before, publication: false },
    { outcome: nativeCopyrightSerializationConflict, state: claimed, publication: false },
    ...(guarded
      ? [
          { outcome: nativeCopyrightSerializationConflict, state: guarded, publication: true },
          { outcome: { status: 'fulfilled', value: 'stale' }, state: success, publication: true },
        ]
      : []),
  ]).toContainEqual({
    outcome: result!.status === 'fulfilled' ? result : copyrightRaceResult(result!),
    state: await readDeliveryContractState(owner),
    publication,
  })
}
