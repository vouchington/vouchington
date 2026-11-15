import type { NativeConsumerManifestEntry } from './types.mts'

/** Copyright AI run status copy native clients render; adoption is pending in both clients. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_55_COPYRIGHT_AI_RUN_STATUS = [
  'active',
  'expired',
  'failed',
  'succeeded',
].map(status => ({
  key: `native.copyright.aiRunStatus.${status}`,
  consumers: ['dotnet', 'swift'],
  pending: true,
})) as readonly NativeConsumerManifestEntry[]
