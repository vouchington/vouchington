import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import {
  userDeletionsWorkConfig,
  userDeletionsWorkMaxValues,
} from '@services/user-deletions/work-limits'
import {
  apInboxActivitiesWorkConfig,
  apInboxActivitiesWorkMaxValues,
} from '@services/ap-inbox-activities/work-limits'
import {
  engagementEmailsWorkConfig,
  engagementEmailsWorkMaxValues,
} from '@services/engagement-emails/work-limits'
import {
  recommendedTopicsWorkConfig,
  recommendedTopicsWorkMaxValues,
} from '@services/recommended-topics/work-limits'
import { stripeWorkConfig, stripeWorkMaxValues } from '@services/stripe/work-limits'

export const backgroundWorkRegistryEntries8 = {
  'user-deletions-work-config': defineBoundedWorkNamespace(
    userDeletionsWorkConfig,
    'User deletions',
    userDeletionsWorkMaxValues,
    {
      dispatch_timeout_minutes: 'Dispatch timeout minutes before background recovery.',
      processing_timeout_minutes: 'Processing timeout minutes before background recovery.',
      batch_size: 'Batch size for user deletions processing.',
      lifecycle_recovery_batch_size: 'Lifecycle recovery batch size for user deletions processing.',
    },
  ),
  'ap-inbox-activities-work-config': defineBoundedWorkNamespace(
    apInboxActivitiesWorkConfig,
    'ActivityPub inbox recovery',
    apInboxActivitiesWorkMaxValues,
    {
      dispatch_timeout_minutes: 'Dispatch timeout minutes before background recovery.',
      processing_timeout_minutes: 'Processing timeout minutes before background recovery.',
      delivery_transition_recovery_batch_size:
        'Delivery transition recovery batch size for ap inbox activities processing.',
    },
  ),
  'engagement-emails-work-config': defineBoundedWorkNamespace(
    engagementEmailsWorkConfig,
    'Engagement emails',
    engagementEmailsWorkMaxValues,
    {
      dispatch_batch_size: 'Dispatch batch size for engagement emails processing.',
    },
  ),
  'recommended-topics-work-config': defineBoundedWorkNamespace(
    recommendedTopicsWorkConfig,
    'Recommended topics',
    recommendedTopicsWorkMaxValues,
    {
      candidate_page_size: 'Candidate page size for recommended topics processing.',
    },
  ),
  'stripe-work-config': defineBoundedWorkNamespace(
    stripeWorkConfig,
    'Stripe',
    stripeWorkMaxValues,
    {
      dispatch_timeout_minutes: 'Dispatch timeout minutes before background recovery.',
      processing_timeout_minutes: 'Processing timeout minutes before background recovery.',
      recovery_batch_size: 'Recovery batch size for stripe processing.',
    },
  ),
}
