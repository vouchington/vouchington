import { Network } from 'lucide-react'

import type { NavIntent } from './types'

export const FEDIVERSE_INTENT: NavIntent = {
  id: 'fediverse',
  label: 'extracted.intents.productFediverse.fediverse_5b02ab9d',
  icon: Network,
  featureFlag: 'fediverse',
  groups: [
    {
      label: 'extracted.intents.productFediverse.browse_3227aa96',
      dataPw: 'sidebar-group-browse',
      items: [
        {
          label: 'extracted.intents.productFediverse.fediverseSearch_a4896269',
          href: '/fediverse',
          dataPw: 'sidebar-nav-fediverse-search',
          exact: true,
        },
        {
          label: 'extracted.intents.productFediverse.instances_f6e1a7e2',
          href: '/instances',
          dataPw: 'sidebar-nav-fediverse-instances',
        },
      ],
    },
  ],
}
