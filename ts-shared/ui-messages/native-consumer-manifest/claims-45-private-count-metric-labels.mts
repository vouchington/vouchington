import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_45_PRIVATE_COUNT_METRIC_LABELS = [
  { key: 'native.dotnet.bookmarks.mutedRssFeeds', consumers: ['dotnet', 'swift'] },
  { key: 'native.dotnet.bookmarks.savedRssItems', consumers: ['dotnet', 'swift'] },
  { key: 'native.dotnet.bookmarks.subscribedRssFeeds', consumers: ['dotnet', 'swift'] },
  { key: 'native.dotnet.bookmarks.subscribedTopicsForNews', consumers: ['dotnet', 'swift'] },
  { key: 'native.dotnet.bookmarks.subscribedTopicsForPosts', consumers: ['dotnet', 'swift'] },
  { key: 'native.dotnet.bookmarks.subscribedUsersForPosts', consumers: ['swift'] },
  { key: 'native.dotnet.bookmarks.viewedRssFeeds', consumers: ['dotnet', 'swift'] },
  { key: 'native.dotnet.bookmarks.viewedRssItems', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
