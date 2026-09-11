import type { NativeConsumerManifestEntry } from './types.mts'

/** Canonical native consumer claims, continued to keep source files within policy caps. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_10_TOP_HASHTAGS = [
  { key: 'native.dotnet.topHashtags.all', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.createTopic', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.itemsContributors', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.linkTopic', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.linked', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.loadMore', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.recommendations', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.searchHashtags', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.topHashtags', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.topic', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.topicName', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.unlink', consumers: ['dotnet'] },
  { key: 'native.dotnet.topHashtags.unlinked', consumers: ['dotnet'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
