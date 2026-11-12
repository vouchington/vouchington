import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_39_POST_TIME_RANGE = [
  { key: 'extracted.posts.postTimeRangeSelect.allTime', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.posts.postTimeRangeSelect.label', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.posts.postTimeRangeSelect.last30Days', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.posts.postTimeRangeSelect.last7Days', consumers: ['dotnet', 'swift'] },
  { key: 'extracted.posts.postTimeRangeSelect.lastYear', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
