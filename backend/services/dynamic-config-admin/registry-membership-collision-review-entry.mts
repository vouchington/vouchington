import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import {
  STRIPE_PURCHASE_COLLISION_REVIEW_PAGE_MAX,
  collisionReviewPageConfig,
} from '@services/memberships/ineligible-stripe-purchase-reversal/collision-review-page'

export const membershipCollisionReviewRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'membership-stripe-purchase-collision-review-config',
  label: 'Stripe purchase collision reviews',
  description: 'Page size for staff inspection of ambiguous Stripe purchase collision reviews.',
  config: collisionReviewPageConfig,
  access: { update_roles: ['developer'] },
  fields: {
    page_size: {
      description: 'Maximum reviews returned in one staff list page.',
      integer: true,
      minValue: 1,
      maxValue: STRIPE_PURCHASE_COLLISION_REVIEW_PAGE_MAX,
    },
  },
})
