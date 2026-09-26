import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { CopyrightActionDeliveryDependencies } from '../services/copyright-notices/action-delivery-dependencies.mts'

/** External delivery seam for action tests; tuple identity still comes from the real committed outbox. */
export function createTestCopyrightDeliveryDependencies(
  publish: CopyrightActionDeliveryDependencies['publishImagePlacementDeliveryRecord'],
): Pick<
  CopyrightActionDeliveryDependencies,
  | 'assertMediaDeliveryLegalEnforcementEnabled'
  | 'publishImagePlacementDeliveryRecord'
  | 'publishStagedMediaDeliveryRecord'
> {
  return {
    assertMediaDeliveryLegalEnforcementEnabled: () => undefined,
    publishImagePlacementDeliveryRecord: publish,
    publishStagedMediaDeliveryRecord: async deliveryKey => {
      const { rows } = await read<{
        placement_id: string
        placement_revision: number
        asset_id: string
        desired_state: 'allow' | 'withheld'
      }>(sql`
        SELECT placement_id, placement_revision, asset_id, desired_state
        FROM media_delivery_registry_records WHERE delivery_key = ${deliveryKey} AND route_kind = 'placement'
      `)
      const record = rows[0]
      if (!record) throw new Error(`Missing copyright test outbox record ${deliveryKey}`)
      await publish({
        placementId: record.placement_id,
        revision: record.placement_revision,
        imageId: record.asset_id,
        state: record.desired_state,
      })
    },
  }
}
