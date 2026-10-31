import { defineBoundedWorkNamespace } from './registry-bounded-work-entry.mts'
import {
  userDeletionsWorkConfig,
  userDeletionsWorkMaxValues,
} from '@services/user-deletions/work-limits'
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
  'user-deletions-work-config': defineBoundedWorkNamespace({
    namespace: 'user-deletions-work-config',
    config: userDeletionsWorkConfig,
    label: 'User deletions',
    maxValues: userDeletionsWorkMaxValues,
    descriptions: {
      dispatch_timeout_minutes: 'Dispatch timeout minutes before background recovery.',
      processing_timeout_minutes: 'Processing timeout minutes before background recovery.',
      batch_size: 'Batch size for user deletions processing.',
      lifecycle_recovery_batch_size: 'Lifecycle recovery batch size for user deletions processing.',
    },
  }),
  'engagement-emails-work-config': defineBoundedWorkNamespace({
    namespace: 'engagement-emails-work-config',
    config: engagementEmailsWorkConfig,
    label: 'Engagement emails',
    maxValues: engagementEmailsWorkMaxValues,
    descriptions: {
      dispatch_batch_size: 'Dispatch batch size for engagement emails processing.',
    },
  }),
  'recommended-topics-work-config': defineBoundedWorkNamespace({
    namespace: 'recommended-topics-work-config',
    config: recommendedTopicsWorkConfig,
    label: 'Recommended topics',
    maxValues: recommendedTopicsWorkMaxValues,
    descriptions: {
      candidate_page_size: 'Candidate page size for recommended topics processing.',
    },
  }),
  'stripe-work-config': defineBoundedWorkNamespace({
    namespace: 'stripe-work-config',
    config: stripeWorkConfig,
    label: 'Stripe',
    maxValues: stripeWorkMaxValues,
    descriptions: {
      dispatch_timeout_minutes: 'Dispatch timeout minutes before background recovery.',
      processing_timeout_minutes: 'Processing timeout minutes before background recovery.',
      recovery_batch_size: 'Recovery batch size for stripe processing.',
    },
  }),
}
