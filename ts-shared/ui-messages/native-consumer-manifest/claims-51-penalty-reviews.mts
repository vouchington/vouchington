import type { NativeConsumerManifestEntry } from './types.mts'

export const NATIVE_CONSUMER_MANIFEST_CLAIMS_51_PENALTY_REVIEWS = [
  {
    key: 'moderation.penaltyReviews.confirm',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'moderation.penaltyReviews.description',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'moderation.penaltyReviews.due',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'moderation.penaltyReviews.empty',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'moderation.penaltyReviews.loadFailed',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'moderation.penaltyReviews.more',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'moderation.penaltyReviews.refresh',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
  {
    key: 'moderation.penaltyReviews.title',
    consumers: ['dotnet', 'swift'],
    pending: true,
  },
] as const satisfies readonly NativeConsumerManifestEntry[]
