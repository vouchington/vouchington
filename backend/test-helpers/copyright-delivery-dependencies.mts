import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightActionDeliveryDependencies } from '../services/copyright-notices/action-delivery-dependencies.mts'

export type CopyrightTestDeliveryPublisher = (
  input: Parameters<CopyrightActionDeliveryDependencies['prepublishImagePlacementDenial']>[0] & {
    state: 'allow' | 'withheld'
  },
  options?: Parameters<CopyrightActionDeliveryDependencies['prepublishImagePlacementDenial']>[1],
) => Promise<void>

/** External delivery seam for action tests; tuple identity still comes from the real committed outbox. */
export function createTestCopyrightDeliveryDependencies(
  publish: CopyrightTestDeliveryPublisher,
): Pick<
  CopyrightActionDeliveryDependencies,
  | 'assertMediaDeliveryLegalEnforcementEnabled'
  | 'prepublishImagePlacementDenial'
  | 'publishStagedMediaDeliveryRecord'
> {
  return {
    assertMediaDeliveryLegalEnforcementEnabled: () => undefined,
    prepublishImagePlacementDenial: (input, options) =>
      publish({ ...input, state: 'withheld' }, options),
    publishStagedMediaDeliveryRecord: async deliveryKey => {
      const { rows } = await read<{
        placement_id: string
        placement_revision: number
        image_id: string
        desired_state: 'allow' | 'withheld'
      }>(sql`
        SELECT placement_id, placement_revision, image_id, desired_state
        FROM media_delivery_registry_current_records WHERE delivery_key = ${deliveryKey}
      `)
      const record = rows[0]
      if (!record) throw new Error(`Missing copyright test outbox record ${deliveryKey}`)
      await publish({
        placementId: record.placement_id,
        revision: record.placement_revision,
        imageId: record.image_id,
        state: record.desired_state,
      })
    },
  }
}
