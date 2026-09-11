import { nativeRouteMainAuthSearchMessages } from './main-auth-search.ts'
import { nativeRouteMainFeedsMessages } from './main-feeds.ts'
import { nativeRouteMainContentMessages } from './main-content.ts'
import { nativeRouteMainEntitiesFrPtMessages } from './main-entities-fr-pt.ts'
import { nativeRouteMainCommunicationMessages } from './main-communication.ts'
import { nativeRouteMainAccountModerationMessages } from './main-account-moderation.ts'
import { nativeRouteStaffOperationsMessages } from './staff-operations.ts'
import { nativeRouteStaffEngineeringMessages } from './staff-engineering.ts'
import { nativeRouteStaffGrowthModerationMessages } from './staff-growth-moderation.ts'
import { nativeRouteFediverseMessages } from './fediverse.ts'
import { nativeRouteComparisonMessages } from './comparison.ts'
import { nativeRouteLibraryMessages } from './library.ts'

export const nativeRouteMetadataPtMessages = {
  ...nativeRouteMainAuthSearchMessages.pt,
  ...nativeRouteMainFeedsMessages.pt,
  ...nativeRouteMainContentMessages.pt,
  ...nativeRouteMainEntitiesFrPtMessages.pt,
  ...nativeRouteMainCommunicationMessages.pt,
  ...nativeRouteMainAccountModerationMessages.pt,
  ...nativeRouteStaffOperationsMessages.pt,
  ...nativeRouteStaffEngineeringMessages.pt,
  ...nativeRouteStaffGrowthModerationMessages.pt,
  ...nativeRouteFediverseMessages.pt,
  ...nativeRouteComparisonMessages.pt,
  ...nativeRouteLibraryMessages.pt,
} as const
