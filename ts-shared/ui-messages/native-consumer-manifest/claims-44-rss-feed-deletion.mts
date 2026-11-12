import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_44_RSS_FEED_DELETION = [
  { key: 'shared.rssFeedDeletion.accepted', consumers: ['dotnet', 'swift'] },
  { key: 'shared.rssFeedDeletion.blockedByAdminImports', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
