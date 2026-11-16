import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_54_AI_RUN_STATUS = [
  {
    key: 'native.swift.aiRunStatus.appealDraftActive',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'native.swift.aiRunStatus.appealDraftExpired',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'native.swift.aiRunStatus.appealDraftFailed',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'native.swift.aiRunStatus.appealDraftSucceeded',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
