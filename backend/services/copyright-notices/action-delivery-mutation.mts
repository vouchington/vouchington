import { beginTransaction } from '@data-stores/psql'
import type { CopyrightImagePlacementMutation } from '@services/images/placements'
import type { CopyrightActionDeliveryDependencies } from './action-delivery-dependencies.mts'
import {
  completeCopyrightActionIntentInTransaction,
  type LockedCopyrightActionDelivery,
} from './action-delivery-state.mts'

type CurrentPlacement = Exclude<
  CopyrightImagePlacementMutation,
  { status: 'not_found' }
>['placement']

export async function mutateCopyrightPlacement(input: {
  intentId: string
  legal: LockedCopyrightActionDelivery
  current: CurrentPlacement
  now: Date
  dependencies: CopyrightActionDeliveryDependencies
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<{ placement: CurrentPlacement } | { terminal: 'stale' }> {
  const mutation =
    (input.legal.action === 'withhold' && input.current.withheld) ||
    (input.legal.action === 'restore' && !input.current.withheld)
      ? ({ status: 'already_applied', placement: input.current } as const)
      : input.legal.action === 'withhold'
        ? await input.dependencies.withholdImagePlacementForCopyright(
            {
              placementKey: input.legal.placement_key,
              expectedRevision: input.legal.expected_placement_revision,
            },
            { query: input.query },
          )
        : await input.dependencies.restoreImagePlacementForCopyright(
            {
              placementKey: input.legal.placement_key,
              expectedRevision: input.legal.expected_placement_revision,
            },
            { query: input.query },
          )
  if (
    mutation.status !== 'stale' &&
    mutation.status !== 'deleted' &&
    mutation.status !== 'not_found'
  ) {
    return { placement: mutation.placement }
  }
  await completeCopyrightActionIntentInTransaction({
    intentId: input.intentId,
    outcome: 'stale',
    completedAt: input.now,
    failureMessage: `Placement transition was ${mutation.status}.`,
    query: input.query,
  })
  return { terminal: 'stale' }
}

export function isCurrentPlacementForIntent(
  current: Awaited<
    ReturnType<CopyrightActionDeliveryDependencies['getImagePlacementForCopyright']>
  >,
  legal: LockedCopyrightActionDelivery,
): current is CurrentPlacement {
  return Boolean(
    current &&
    !current.deleted &&
    current.imageId === legal.image_id &&
    (current.revision === legal.expected_placement_revision ||
      current.revision === legal.expected_placement_revision + 1),
  )
}
