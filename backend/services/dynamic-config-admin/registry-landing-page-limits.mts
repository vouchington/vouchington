import { defineDynamicConfigNamespace } from 'valkyries/dynamic-config'
import {
  LANDING_PAGE_LIMIT_MAX_VALUES,
  landingPageLimitsConfig,
} from '@services/my/landing-pages/limits'

export const landingPageLimitsRegistryEntry = defineDynamicConfigNamespace({
  namespace: 'landing-page-limits-config',
  label: 'Landing Page Limits',
  description: 'Total items allowed on one landing page, including topic groups and their entries.',
  config: landingPageLimitsConfig,
  access: { update_roles: [] },
  fields: {
    items_per_page: {
      description: 'Maximum combined number of top-level items and nested topic-group entries.',
      minValue: 1,
      maxValue: LANDING_PAGE_LIMIT_MAX_VALUES.items_per_page,
    },
  },
})
