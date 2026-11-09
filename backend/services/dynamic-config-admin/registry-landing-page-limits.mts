import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import {
  LANDING_PAGE_LIMIT_MAX_VALUES,
  landingPageLimitsConfig,
} from '@services/my/landing-pages/limits'

export const landingPageLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'landing-page-limits-config',
  label: 'Landing Page Limits',
  description: 'Landing page and item capacity with bounded transactional write recovery.',
  config: landingPageLimitsConfig,
  access: { update_roles: [] },
  fields: {
    pages_per_user: {
      description: 'Maximum landing pages owned by one user, within the schema slot ceiling.',
      integer: true,
      minValue: 1,
      maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.pages_per_user,
    },
    transaction_attempts: {
      description:
        'Maximum whole-transaction attempts for deadlocks, serialization failures and conflicting default promotions, including the initial write.',
      integer: true,
      minValue: 1,
      maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.transaction_attempts,
    },
    items_per_page: {
      description: 'Maximum combined number of top-level items and nested topic-group entries.',
      integer: true,
      minValue: 1,
      maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.items_per_page,
    },
  },
})
