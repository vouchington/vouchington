import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import {
  LANDING_PAGE_LIMIT_MAX_VALUES,
  landingPageLimitsConfig,
} from '@services/my/landing-pages/limits'

export const landingPageLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'landing-page-limits-config',
  label: 'Landing Page Limits',
  description:
    'Landing page caps: pages per user, and total items on one page including topic groups and their entries.',
  config: landingPageLimitsConfig,
  access: { update_roles: [] },
  fields: {
    items_per_page: {
      description: 'Maximum combined number of top-level items and nested topic-group entries.',
      integer: true,
      minValue: 1,
      maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.items_per_page,
    },
    pages_per_user: {
      description:
        'Maximum landing pages one user may own. Lowering it rejects new pages above it; pages already stored stay readable.',
      integer: true,
      minValue: 1,
      maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.pages_per_user,
    },
    utm_sources_listed: {
      description: 'Top UTM sources listed in one landing page analytics dashboard.',
      integer: true,
      minValue: 1,
      maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.utm_sources_listed,
    },
  },
})
