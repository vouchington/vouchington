import type { NativeConsumerManifestEntry } from './types.mts'

/** Canonical claims for current native contract and fixture consumers. */
export const NATIVE_CONSUMER_MANIFEST_CLAIMS_28_CLIENTS_INTEGRATION = [
  {
    key: 'extracted.comments.commentAncestorTrail.showEarlierReplies_56b87971',
    consumers: ['dotnet', 'swift'],
  },
  { key: 'moderation.communityBans.active', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.communityBans.confirmLiftAll', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.communityBans.confirmLiftAllDescription', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.communityBans.detailLoadFailed', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.communityBans.liftAll', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.communityBans.liftAllForbidden', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.communityBans.liftAllLimit', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.communityBans.liftAllLimitUnknown', consumers: ['dotnet', 'swift'] },
  { key: 'moderation.communityBans.liftFailed', consumers: ['dotnet', 'swift'] },
  { key: 'native.common.imagePlacementLimitReached', consumers: ['dotnet', 'swift'] },
  { key: 'native.common.relatedArticles', consumers: ['dotnet', 'swift'] },
  { key: 'native.common.relatedArticlesMore', consumers: ['dotnet', 'swift'] },
  { key: 'native.communities.automodEstimateSample', consumers: ['swift'] },
  { key: 'native.communities.automodSampleSummary', consumers: ['swift'] },
  { key: 'native.communities.membershipLimitReached', consumers: ['dotnet', 'swift'] },
  { key: 'native.communities.moderatorLimitReached', consumers: ['dotnet', 'swift'] },
  { key: 'shared.accountType.aiAgent', consumers: ['dotnet', 'swift'] },
  { key: 'shared.accountType.official', consumers: ['dotnet', 'swift'] },
  { key: 'shared.accountType.system', consumers: ['dotnet', 'swift'] },
] as const satisfies readonly NativeConsumerManifestEntry[]
