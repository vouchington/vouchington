import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_47_ENGINEERING_RANGES = [
  { key: 'engineering.classifierRange.confirmCreate', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.confirmRetire', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.create', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.fromInclusiveUtc', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.invalidRange', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.maxDefaultRows', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.retire', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.toExclusiveUtc', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.requestRange.confirmCreate', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.requestRange.confirmRetire', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.requestRange.create', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.requestRange.fromInclusiveUtc', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.requestRange.invalidRange', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.requestRange.maxDefaultRows', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.requestRange.retire', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.requestRange.toExclusiveUtc', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
