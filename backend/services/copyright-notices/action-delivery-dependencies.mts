import {
  getImagePlacementForCopyright,
  getPostIdForImagePlacementCopyright,
  restoreImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
} from '@services/images/placements'
import { clearUnavailableImagePlacementCopyrightWithholding } from '@services/images/placement-copyright-resolution'
import { publishImagePlacementDeliveryRecord } from '@services/images/delivery-registry'
import { assertMediaDeliveryLegalEnforcementEnabled } from '@modules/aws'

async function publishCopyrightLegalImagePlacementDeliveryRecord(
  ...args: Parameters<typeof publishImagePlacementDeliveryRecord>
): ReturnType<typeof publishImagePlacementDeliveryRecord> {
  assertMediaDeliveryLegalEnforcementEnabled()
  return publishImagePlacementDeliveryRecord(...args)
}

export type CopyrightActionDeliveryDependencies = {
  clearUnavailableImagePlacementCopyrightWithholding: typeof clearUnavailableImagePlacementCopyrightWithholding
  getImagePlacementForCopyright: typeof getImagePlacementForCopyright
  withholdImagePlacementForCopyright: typeof withholdImagePlacementForCopyright
  restoreImagePlacementForCopyright: typeof restoreImagePlacementForCopyright
  getPostIdForImagePlacementCopyright: typeof getPostIdForImagePlacementCopyright
  publishImagePlacementDeliveryRecord: typeof publishImagePlacementDeliveryRecord
}

const defaultDependencies: CopyrightActionDeliveryDependencies = {
  clearUnavailableImagePlacementCopyrightWithholding,
  getImagePlacementForCopyright,
  withholdImagePlacementForCopyright,
  restoreImagePlacementForCopyright,
  getPostIdForImagePlacementCopyright,
  publishImagePlacementDeliveryRecord: publishCopyrightLegalImagePlacementDeliveryRecord,
}

export function getCopyrightActionDeliveryDependencies(
  overrides: Partial<CopyrightActionDeliveryDependencies>,
): CopyrightActionDeliveryDependencies {
  return { ...defaultDependencies, ...overrides }
}
