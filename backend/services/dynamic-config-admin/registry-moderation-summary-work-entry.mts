import {
  moderationSummaryWorkConfig,
  moderationSummaryWorkMaxValues,
} from '@services/communities/moderation-summary-work'
import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'

export const moderationSummaryWorkRegistryEntry = defineBoundedWorkNamespace({
  namespace: 'moderation-summary-work-config',
  config: moderationSummaryWorkConfig,
  maxValues: moderationSummaryWorkMaxValues,
  label: 'Moderator digest collection',
  descriptions: {
    membership_page_size: 'Memberships inspected by one moderator digest collection job.',
    source_page_size: 'Raw community rows inspected by one moderator digest collection job.',
  },
})
