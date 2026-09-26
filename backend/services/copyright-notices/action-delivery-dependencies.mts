import {
  getImagePlacementForCopyright,
  getPostIdForImagePlacementCopyright,
  restoreImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from '@services/images/placements'
import { clearUnavailableImagePlacementCopyrightWithholding } from '@services/images/placement-copyright-resolution'
import {
  publishImagePlacementDeliveryRecord,
  publishStagedMediaDeliveryRecord,
} from '@services/media-delivery-safety'
import { assertMediaDeliveryLegalEnforcementEnabled } from '@modules/aws'

async function publishCopyrightLegalImagePlacementDeliveryRecord(
  ...args: Parameters<typeof publishImagePlacementDeliveryRecord>
): ReturnType<typeof publishImagePlacementDeliveryRecord> {
  assertMediaDeliveryLegalEnforcementEnabled()
  return publishImagePlacementDeliveryRecord(...args)
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
  getPostIdForImagePlacementCopyright: typeof getPostIdForImagePlacementCopyright
  publishImagePlacementDeliveryRecord: typeof publishImagePlacementDeliveryRecord
  publishStagedMediaDeliveryRecord: typeof publishStagedMediaDeliveryRecord
}

const defaultDependencies: CopyrightActionDeliveryDependencies = {
  assertMediaDeliveryLegalEnforcementEnabled,
  clearUnavailableImagePlacementCopyrightWithholding,
  getImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
  getPostIdForImagePlacementCopyright,
  publishImagePlacementDeliveryRecord: publishCopyrightLegalImagePlacementDeliveryRecord,
  publishStagedMediaDeliveryRecord: publishStagedCopyrightDeliveryRecord,
}

export function getCopyrightActionDeliveryDependencies(
  overrides: Partial<CopyrightActionDeliveryDependencies>,
): CopyrightActionDeliveryDependencies {
  return { ...defaultDependencies, ...overrides }
}
