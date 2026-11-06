/* oxlint-disable no-mistakes/playwright-literals, no-mistakes/playwright-defaults -- Settings nav IDs come from static table data; ast-grep still bans inline calls in data-pw. */
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isActivePath } from '@/lib/utils/path'
import { EntityMenubarNav, type EntityMenubarItem } from '@/components/shared/entity-menubar-nav'
import { tabGroups, getActiveTab } from './settings-routes'
import { useTranslations } from '@/lib/i18n/use-translations'

export function SettingsNav() {
  const t = useTranslations()
  const pathname = usePathname()
  const activeTab = getActiveTab(pathname)

  if (!activeTab) return null

  const menuItems: EntityMenubarItem[] = tabGroups.map(({ value, label, items }) => ({
    key: value,
    active: value === activeTab,
    content: (
      <span
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
        data-pw={`settings-nav-${value}-tab`}
      >
        {t(label)}
      </span>
    ),
    dropdownItems: items.map(({ href, label: itemLabel, dataPw }) => ({
      key: href,
      active: isActivePath(pathname, href),
      content: (
        <Link
          href={href}
          prefetch={false}
          aria-current={isActivePath(pathname, href) ? 'page' : undefined}
          data-pw={dataPw}
        >
          {t(itemLabel)}
        </Link>
      ),
    })),
  }))

  return (
    <nav aria-label={t('extracted.my.settingsNav.settingsNavigation_b22070ae')}>
      <EntityMenubarNav
        items={menuItems}
        ariaLabel={t('extracted.my.settingsNav.settingsGroups_8176a2ce')}
      />
    </nav>
  )
}
