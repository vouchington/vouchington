'use client'

import type { MessageKey } from '@ts-shared/ui-messages'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EntityMenubarNav } from '@/components/shared/entity-menubar-nav'
import { useTranslations } from '@/lib/i18n/use-translations'
import { isActivePath } from '@/lib/utils/path'
import { DataPw } from '@/components/shared/data-pw'

const TABS: { label: MessageKey; href: string; dataPw: string }[] = [
  {
    label: 'extracted.my.findFriendsTabs.suggestions_16c1d601',
    href: '/my/friend-recommendations',
    dataPw: 'find-friends-tab-suggestions',
  },
  {
    label: 'extracted.my.findFriendsTabs.dismissed_9d747277',
    href: '/my/friend-recommendations/dismissed',
    dataPw: 'find-friends-tab-dismissed',
  },
]

export function FindFriendsTabs() {
  const pathname = usePathname()
  const t = useTranslations()

  return (
    <EntityMenubarNav
      ariaLabel='Find friends navigation'
      items={TABS.map(tab => {
        const active =
          tab.href === '/my/friend-recommendations'
            ? pathname === '/my/friend-recommendations'
            : isActivePath(pathname, tab.href)
        return {
          key: tab.href,
          active,
          content: (
            <DataPw
              dataPw={tab.dataPw}
              as={Link}
              href={tab.href}
              prefetch={false}
              aria-current={active ? 'page' : undefined}
            >
              {t(tab.label)}
            </DataPw>
          ),
        }
      })}
    />
  )
}
