import { dynamicConfigRegistryEntries } from './registry-entries.mts'
import type { DynamicConfigRegistryEntry } from './types.mts'

export const dynamicConfigRegistry = dynamicConfigRegistryEntries

export function getDynamicConfigRegistryEntry(
  namespace: string,
): DynamicConfigRegistryEntry | null {
  return dynamicConfigRegistry.find(entry => entry.namespace === namespace) ?? null
}
