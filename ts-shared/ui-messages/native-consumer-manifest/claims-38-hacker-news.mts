import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_38_HACKER_NEWS = [
  { key: 'shared.hackerNews.commentOn', consumers: ['dotnet', 'swift'] },
  { key: 'shared.hackerNews.filterLabel', consumers: ['dotnet', 'swift'] },
  { key: 'shared.hackerNews.mentionedCount', consumers: ['dotnet', 'swift'] },
  { key: 'shared.hackerNews.mentionedOnCount', consumers: ['dotnet', 'swift'] },
  { key: 'shared.hackerNews.mentionedOnHeading', consumers: ['dotnet', 'swift'] },
  { key: 'shared.hackerNews.seenOnCount', consumers: ['dotnet', 'swift'] },
  { key: 'shared.hackerNews.seenOnHeading', consumers: ['dotnet', 'swift'] },
  { key: 'shared.hackerNews.storySummary', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
