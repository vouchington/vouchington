import { webCommunityProfileApiFixtureCases } from './web-community-profile-cases.mts'
import { webCommunityFeedApiFixtureCases } from './web-community-feed-cases.mts'
import { webCommunityListItemApiFixtureCases } from './web-community-list-item-cases.mts'
import { webCommunityApplicationPinnedApiFixtureCases } from './web-community-application-pinned-cases.mts'
import type { ApiFixtureCase } from './types.mts'

export const webCommunityApiFixtureCases: ApiFixtureCase[] = [
  ...webCommunityProfileApiFixtureCases,
  ...webCommunityFeedApiFixtureCases,
  ...webCommunityListItemApiFixtureCases,
  ...webCommunityApplicationPinnedApiFixtureCases,
]
