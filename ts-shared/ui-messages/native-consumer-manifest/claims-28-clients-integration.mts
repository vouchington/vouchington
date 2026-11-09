import type { NativeConsumerManifestEntry } from './types.mts'

/** Canonical claims for current native contract and fixture consumers. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_28_CLIENTS_INTEGRATION = [
  { key: 'engineering.classifierRange.confirmCreate', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.confirmRetire', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.create', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.fromInclusiveUtc', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.maxDefaultRows', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.retire', consumers: ['dotnet', 'swift'] },
  { key: 'engineering.classifierRange.toExclusiveUtc', consumers: ['dotnet', 'swift'] },
  {
    key: 'extracted.comments.commentAncestorTrail.showEarlierReplies_56b87971',
    consumers: ['dotnet', 'swift'],
  },
  { key: 'moderation.penaltyReviews.confirm', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.penaltyReviews.description', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.penaltyReviews.due', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.penaltyReviews.empty', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.penaltyReviews.loadFailed', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.penaltyReviews.refresh', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.penaltyReviews.title', consumers: ['dotnet', 'swift'] },
  { key: 'native.common.relatedArticles', consumers: ['dotnet', 'swift'] },
  { key: 'native.common.relatedArticlesMore', consumers: ['dotnet', 'swift'] },
  { key: 'shared.accountType.aiAgent', consumers: ['dotnet', 'swift'] },
  { key: 'shared.accountType.official', consumers: ['dotnet', 'swift'] },
  { key: 'shared.accountType.system', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
