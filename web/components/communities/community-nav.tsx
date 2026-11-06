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
        <span
          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from tab data
          data-pw={`community-nav-${tab.name}`}
        >
          {t(tab.label)}
        </span>
      ) : (
        <Link
          href={tab.path}
          prefetch={false}
          scroll={false}
          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from tab data
          data-pw={`community-nav-${tab.name}`}
        >
          {t(tab.label)}
        </Link>
      ),
      dropdownItems: tab.dropdownItems?.map(item => ({
        key: item.name,
        active: isActivePath(pathname, item.path),
        content: (
          <Link
            href={item.path}
            prefetch={false}
            scroll={false}
            // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from tab data
            data-pw={`community-nav-${item.name}`}
          >
            {t(item.label)}
          </Link>
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
