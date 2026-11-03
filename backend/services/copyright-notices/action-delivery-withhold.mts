import { beginTransaction } from '@data-stores/psql'
import type { CopyrightImagePlacement } from '@services/images/placements'
import { prepublishCopyrightImagePlacementDenial } from './action-delivery-edge.mts'
import type { LockedCopyrightActionDelivery } from './action-delivery-state.mts'

export async function prepublishWithholdIfNeeded(input: {
  legal: LockedCopyrightActionDelivery
  placement: CopyrightImagePlacement
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<void> {
  if (
    input.placement.withheld ||
    input.placement.revision !== input.legal.expected_placement_revision
  )
    return
  await prepublishCopyrightImagePlacementDenial(
    {
      placementId: input.placement.placementId,
      revision: input.placement.revision,
      imageId: input.placement.imageId,
    },
    { query: input.query },
  )
}

export async function publishRestoreBlockerWithhold(input: {
  legal: LockedCopyrightActionDelivery
  placement: CopyrightImagePlacement
  query: Awaited<ReturnType<typeof beginTransaction>>
}): Promise<void> {
  if (input.legal.action !== 'restore' || input.placement.deleted || input.placement.withheld)
    return
  await prepublishCopyrightImagePlacementDenial(
    {
      placementId: input.placement.placementId,
      revision: input.placement.revision,
      imageId: input.placement.imageId,
    },
    { query: input.query },
  )
}
