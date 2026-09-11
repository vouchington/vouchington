import { nativeRouteMainAuthSearchMessages } from './main-auth-search.ts'
import { nativeRouteMainFeedsMessages } from './main-feeds.ts'
import { nativeRouteMainContentMessages } from './main-content.ts'
import { nativeRouteMainEntitiesEnEsMessages } from './main-entities-en-es.ts'
import { nativeRouteMainCommunicationMessages } from './main-communication.ts'
import { nativeRouteMainAccountModerationMessages } from './main-account-moderation.ts'
import { nativeRouteStaffOperationsMessages } from './staff-operations.ts'
import { nativeRouteStaffEngineeringMessages } from './staff-engineering.ts'
import { nativeRouteStaffGrowthModerationMessages } from './staff-growth-moderation.ts'
import { nativeRouteFediverseMessages } from './fediverse.ts'
import { nativeRouteComparisonMessages } from './comparison.ts'
import { nativeRouteLibraryMessages } from './library.ts'

export const nativeRouteMetadataEnMessages = {
  ...nativeRouteMainAuthSearchMessages.en,
  ...nativeRouteMainFeedsMessages.en,
  ...nativeRouteMainContentMessages.en,
  ...nativeRouteMainEntitiesEnEsMessages.en,
  ...nativeRouteMainCommunicationMessages.en,
  ...nativeRouteMainAccountModerationMessages.en,
  ...nativeRouteStaffOperationsMessages.en,
  ...nativeRouteStaffEngineeringMessages.en,
  ...nativeRouteStaffGrowthModerationMessages.en,
  ...nativeRouteFediverseMessages.en,
  ...nativeRouteComparisonMessages.en,
  ...nativeRouteLibraryMessages.en,
} as const
