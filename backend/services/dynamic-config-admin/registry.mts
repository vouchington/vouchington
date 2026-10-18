import { createDynamicConfigRegistry } from 'valkyries/dynamic-config'
import type { DynamicConfigRegistryEntry } from '@vouchington/dynamic-config'
import { dynamicConfigRegistryEntries } from './registry-entries.mts'

export const dynamicConfigRegistry = createDynamicConfigRegistry<DynamicConfigRegistryEntry>(
  dynamicConfigRegistryEntries,
)
