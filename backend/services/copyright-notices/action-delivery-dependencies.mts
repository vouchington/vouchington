import { publishStagedCopyrightDeliveryRecord } from './action-delivery-edge.mts'

/**
 * Kept for the persisted-authority race tests: they must pause after the staged tuple commits and
 * before `publishStagedMediaDeliveryRecord` takes the placement delivery lock, and no real boundary
 * sits between those two points. Production never passes it.
 */
export type CopyrightActionDeliveryDependencies = {
  publishStagedMediaDeliveryRecord: typeof publishStagedCopyrightDeliveryRecord
}

const defaultDependencies: CopyrightActionDeliveryDependencies = {
  publishStagedMediaDeliveryRecord: publishStagedCopyrightDeliveryRecord,
}

export function getCopyrightActionDeliveryDependencies(
  overrides: Partial<CopyrightActionDeliveryDependencies>,
): CopyrightActionDeliveryDependencies {
  return { ...defaultDependencies, ...overrides }
}
