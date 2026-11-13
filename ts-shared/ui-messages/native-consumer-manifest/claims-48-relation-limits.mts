import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_48_RELATION_LIMITS = [
  { key: 'shared.relationLimit.follow', consumers: ['dotnet', 'swift'], pending: true },
  { key: 'shared.relationLimit.importResult', consumers: ['dotnet', 'swift'], pending: true },
  { key: 'shared.relationLimit.importSkipped', consumers: ['dotnet', 'swift'], pending: true },
  { key: 'shared.relationLimit.subscribe', consumers: ['dotnet', 'swift'], pending: true },
] as const satisfies readonly NativeConsumerManifestEntry[]
