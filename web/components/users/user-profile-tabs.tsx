'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EntityMenubarNav } from '@/components/shared/entity-menubar-nav'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { UserMetrics } from '@/types/user'
import { getActiveTabValue } from './user-detail-tab-active'
import { buildUserProfileDropdownItems } from './user-detail-tab-definitions'
import {
  getVisibleTopLevelTabs,
  getActiveTopLevelTab,
  getTopLevelTabHref,
} from './user-profile-tabs-config'

interface UserProfileTabsProps {
  usernameOrId: string
  metrics?: UserMetrics
}

export function UserProfileTabs({ usernameOrId, metrics }: UserProfileTabsProps) {
  const t = useTranslations()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const uiLocale = useUiLocale()
  const activeTopLevel = getActiveTopLevelTab(pathname, usernameOrId)
  const activeSubValue = getActiveTabValue(pathname)
  const visibleTabs = getVisibleTopLevelTabs()
  const currentFeedType = searchParams.get('feed_type') ?? undefined

  return (
    <EntityMenubarNav
      ariaLabel={t('extracted.users.userProfileTabs.userProfileNavigation_92fbb7a5')}
      items={visibleTabs.map(tab => {
        const dropdownItems = buildUserProfileDropdownItems(
          t,
          tab.name,
          usernameOrId,
          metrics,
          activeSubValue,
          uiLocale,
          currentFeedType,
        )
        const hasDropdown = dropdownItems !== null && dropdownItems.length > 0

        if (hasDropdown) {
          return {
            key: tab.name,
            content: (
              <Button
                type='button'
                variant='ghost'
                size='sm'
                // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from tab config
                data-pw={`user-profile-tab-${tab.name}`}
              >
                {t(tab.label)}
                <ChevronDown data-icon='inline-end' />
              </Button>
            ),
            active: tab.name === activeTopLevel,
            dropdownItems: dropdownItems.map(dt => {
              const isActive = dt.active ?? dt.routeSuffix === activeSubValue
              return {
                key: dt.value,
                content: (
                  <Link
                    href={dt.href}
                    prefetch={false}
                    scroll={false}
                    aria-current={isActive ? 'page' : undefined}
                    // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from tab config
                    data-pw={`user-profile-subpill-${dt.value}`}
                  >
                    {dt.label}
                  </Link>
                ),
                active: isActive,
              }
            }),
          }
        }

        return {
          key: tab.name,
          content: (
            <Link
              href={getTopLevelTabHref(tab, usernameOrId)}
              prefetch={false}
              scroll={false}
              aria-current={tab.name === activeTopLevel ? 'page' : undefined}
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from tab config
              data-pw={`user-profile-tab-${tab.name}`}
            >
              {t(tab.label)}
            </Link>
          ),
          active: tab.name === activeTopLevel,
        }
      })}
      preserveScrollOnNavigation
    />
  )
}
