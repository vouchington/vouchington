import type { NativeConsumerManifestEntry } from './types.mts'

/** Canonical claims for current native contract and fixture consumers. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_28_CLIENTS_INTEGRATION = [
  {
    key: 'extracted.comments.commentAncestorTrail.showEarlierReplies_56b87971',
    consumers: ['dotnet', 'swift'],
  },
  { key: 'native.common.relatedArticles', consumers: ['dotnet', 'swift'] },
  { key: 'native.common.relatedArticlesMore', consumers: ['dotnet', 'swift'] },
  { key: 'shared.accountType.aiAgent', consumers: ['dotnet', 'swift'] },
  { key: 'shared.accountType.official', consumers: ['dotnet', 'swift'] },
  { key: 'shared.accountType.system', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
