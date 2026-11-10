import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_37_TOPIC_MERGE = [
  { key: 'settings.topics.merge.checkStatus', consumers: ['dotnet', 'swift'] },
  { key: 'settings.topics.merge.completed', consumers: ['dotnet', 'swift'] },
  { key: 'settings.topics.merge.failed', consumers: ['dotnet', 'swift'] },
  { key: 'settings.topics.merge.queued', consumers: ['dotnet', 'swift'] },
  { key: 'settings.topics.merge.statusFailed', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
