import type { NativeConsumerManifestEntry } from './types.mts'

/**
 * Copyright notice target-cap copy for vouchington-clients#741: shown by code when a notice names
 * more hosted items than the configured limit. Adoption is pending.
 */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_57_COPYRIGHT_TARGET_LIMIT = [
  'shared.copyrightTargetLimit',
  'shared.copyrightTargetLimitMax',
].map(key => ({
  key,
  consumers: ['dotnet', 'swift'],
  pending: true,
})) as readonly NativeConsumerManifestEntry[]
