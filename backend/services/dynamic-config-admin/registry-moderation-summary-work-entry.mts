import {
  moderationSummaryWorkConfig,
  moderationSummaryWorkDescriptions,
  moderationSummaryWorkMaxValues,
} from '@services/communities/moderation-summary-work'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

export const moderationSummaryWorkRegistryEntry = defineBoundedWorkNamespace({
  namespace: 'moderation-summary-work-config',
  config: moderationSummaryWorkConfig,
  maxValues: moderationSummaryWorkMaxValues,
  label: 'Moderator digest collection',
  descriptions: moderationSummaryWorkDescriptions,
})
