import { swiftFeedNotificationApiFixtureCases } from './swift-feed-notification-cases.mts'
import { swiftEmailApiFixtureCases } from './swift-email-cases.mts'
import { swiftIdentitySessionApiFixtureCases } from './swift-identity-session-cases.mts'
import { swiftRssPodcastApiFixtureCases } from './swift-rss-podcast-cases.mts'
import type { ApiFixtureCase } from './types.mts'

export const swiftApiFixtureCases: ApiFixtureCase[] = [
  ...swiftFeedNotificationApiFixtureCases,
  ...swiftEmailApiFixtureCases,
  ...swiftIdentitySessionApiFixtureCases,
  ...swiftRssPodcastApiFixtureCases,
]
