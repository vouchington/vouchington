import type { NativeConsumerManifestEntry } from './types.mts'

/** Staff dispute AI-draft outcomes native clients show for an exact run. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_53_DISPUTE_RUN_OUTCOMES = [
  'native.swift.reviewDisputes.rerunFailed',
  'native.swift.reviewDisputes.rerunExpired',
].map(key => ({
  key,
  consumers: ['dotnet', 'swift'],
})) as readonly NativeConsumerManifestEntry[]
