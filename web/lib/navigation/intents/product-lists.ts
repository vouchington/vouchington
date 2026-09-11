import { BookMarked } from 'lucide-react'
import type { NavIntent } from './types'

export const LISTS_INTENT: NavIntent = {
  id: 'lists',
  label: 'extracted.intents.productLists.lists_308d5a09',
  icon: BookMarked,
  requiresAuth: true,
  groups: [
    {
      label: 'extracted.intents.productLists.myLists_94de1d96',
      dataPw: 'sidebar-group-my-lists',
      requiresAuth: true,
      items: [
        {
          label: 'extracted.intents.productLists.myLists_94de1d96',
          href: '/my/lists',
          dataPw: 'sidebar-nav-my-lists',
          requiresAuth: true,
        },
      ],
    },
  ],
}
