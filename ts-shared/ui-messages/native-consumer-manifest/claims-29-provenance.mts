import type { NativeConsumerManifestEntry } from './types.mts'

/** Native labels for trusted public provenance facts. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_29_PROVENANCE = [
  { key: 'shared.provenance.viaApi', consumers: ['dotnet', 'swift'] },
  { key: 'shared.provenance.viaApp', consumers: ['dotnet', 'swift'] },
  { key: 'shared.provenance.viaMcp', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
