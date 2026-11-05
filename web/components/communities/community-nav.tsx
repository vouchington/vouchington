'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { EntityMenubarNav, type EntityMenubarItem } from '@/components/shared/entity-menubar-nav'
import { useTranslations } from '@/lib/i18n/use-translations'
import { createCommunityPathname } from '@/lib/links/entity-href'
import { isActivePath } from '@/lib/utils/path'
import type {
  CommunityMember,
  CommunityMemberRole,
  CommunityVisibility,
} from '@/types/api-responses'
import { buildCommunityNavTabs, isCommunityNavTabActive } from './community-nav-tabs'
import { DataPw } from '@/components/shared/data-pw'

interface CommunityNavProps {
  slug: string
  visibility: CommunityVisibility
  newsEnabled: boolean
  membership?: CommunityMember | null
  currentUserRole?: CommunityMemberRole | null
  hasPendingApplication?: boolean
}

export function CommunityNav({
  slug,
  visibility,
  newsEnabled,
  membership,
  currentUserRole,
  hasPendingApplication,
}: CommunityNavProps) {
  const pathname = usePathname()
  const base = createCommunityPathname(slug)
  const t = useTranslations()

  const tabs = buildCommunityNavTabs({
    base,
    visibility,
    newsEnabled,
    membership,
    currentUserRole,
    hasPendingApplication,
  })

  const items: EntityMenubarItem[] = tabs.map(tab => {
    return {
      key: tab.name,
      active: isCommunityNavTabActive(tab, pathname, base),
      content: tab.dropdownItems ? (
        <DataPw
          dataPw={`community-nav-${tab.name}`}
          as='span'
        >
          {t(tab.label)}
        </DataPw>
      ) : (
        <DataPw
          dataPw={`community-nav-${tab.name}`}
          as={Link}
          href={tab.path}
          prefetch={false}
          scroll={false}
        >
          {t(tab.label)}
        </DataPw>
      ),
      dropdownItems: tab.dropdownItems?.map(item => ({
        key: item.name,
        active: isActivePath(pathname, item.path),
        content: (
          <DataPw
            dataPw={`community-nav-${item.name}`}
            as={Link}
            href={item.path}
            prefetch={false}
            scroll={false}
          >
            {t(item.label)}
          </DataPw>
        ),
      })),
    }
  })

  return (
    <EntityMenubarNav
      ariaLabel='Community navigation'
      items={items}
      preserveScrollOnNavigation
    />
  )
}
