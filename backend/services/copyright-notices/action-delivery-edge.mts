import {
  prepublishImagePlacementDenial,
  publishStagedMediaDeliveryRecord,
} from '@services/media-delivery-safety'
import { assertMediaDeliveryLegalEnforcementEnabled } from '@modules/aws'

export async function prepublishCopyrightImagePlacementDenial(
  ...args: Parameters<typeof prepublishImagePlacementDenial>
): ReturnType<typeof prepublishImagePlacementDenial> {
  assertMediaDeliveryLegalEnforcementEnabled()
  return prepublishImagePlacementDenial(...args)
}

export async function publishStagedCopyrightDeliveryRecord(
  mediaDeliveryRegistryRecordId: string,
): Promise<void> {
  assertMediaDeliveryLegalEnforcementEnabled()
  await publishStagedMediaDeliveryRecord(mediaDeliveryRegistryRecordId)
}
