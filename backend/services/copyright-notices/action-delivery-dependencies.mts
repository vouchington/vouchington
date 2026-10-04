import {
  getImagePlacementForCopyright,
  getImagePlacementCopyrightOwner,
  restoreImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from '@services/images/placements'
import { clearUnavailableImagePlacementCopyrightWithholding } from '@services/images/placement-copyright-resolution'
import {
  prepublishImagePlacementDenial,
  publishStagedMediaDeliveryRecord,
} from '@services/media-delivery-safety'
import { assertMediaDeliveryLegalEnforcementEnabled } from '@modules/aws'

async function prepublishCopyrightImagePlacementDenial(
  ...args: Parameters<typeof prepublishImagePlacementDenial>
): ReturnType<typeof prepublishImagePlacementDenial> {
  assertMediaDeliveryLegalEnforcementEnabled()
  return prepublishImagePlacementDenial(...args)
}

async function publishStagedCopyrightDeliveryRecord(deliveryKey: string): Promise<void> {
  assertMediaDeliveryLegalEnforcementEnabled()
  await publishStagedMediaDeliveryRecord(deliveryKey)
}

export type CopyrightActionDeliveryDependencies = {
  assertMediaDeliveryLegalEnforcementEnabled: typeof assertMediaDeliveryLegalEnforcementEnabled
  clearUnavailableImagePlacementCopyrightWithholding: typeof clearUnavailableImagePlacementCopyrightWithholding
  getImagePlacementForCopyright: typeof getImagePlacementForCopyright
  withholdImagePlacementForCopyright: typeof withholdImagePlacementForCopyright
  restoreImagePlacementForCopyright: typeof restoreImagePlacementForCopyright
  getImagePlacementCopyrightOwner: typeof getImagePlacementCopyrightOwner
  prepublishImagePlacementDenial: typeof prepublishImagePlacementDenial
  publishStagedMediaDeliveryRecord: typeof publishStagedMediaDeliveryRecord
}

const defaultDependencies: CopyrightActionDeliveryDependencies = {
  assertMediaDeliveryLegalEnforcementEnabled,
  clearUnavailableImagePlacementCopyrightWithholding,
  getImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
  getImagePlacementCopyrightOwner,
  prepublishImagePlacementDenial: prepublishCopyrightImagePlacementDenial,
  publishStagedMediaDeliveryRecord: publishStagedCopyrightDeliveryRecord,
}

export function getCopyrightActionDeliveryDependencies(
  overrides: Partial<CopyrightActionDeliveryDependencies>,
): CopyrightActionDeliveryDependencies {
  return { ...defaultDependencies, ...overrides }
}
