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

export const nativeRouteMetadataFrMessages = {
  ...nativeRouteMainAuthSearchMessages.fr,
  ...nativeRouteMainFeedsMessages.fr,
  ...nativeRouteMainContentMessages.fr,
  ...nativeRouteMainEntitiesFrPtMessages.fr,
  ...nativeRouteMainCommunicationMessages.fr,
  ...nativeRouteMainAccountModerationMessages.fr,
  ...nativeRouteStaffOperationsMessages.fr,
  ...nativeRouteStaffEngineeringMessages.fr,
  ...nativeRouteStaffGrowthModerationMessages.fr,
  ...nativeRouteFediverseMessages.fr,
  ...nativeRouteComparisonMessages.fr,
  ...nativeRouteLibraryMessages.fr,
} as const
