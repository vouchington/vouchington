'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { isActivePath } from '@/lib/utils/path'
import { EntityMenubarNav, type EntityMenubarItem } from '@/components/shared/entity-menubar-nav'
import { tabGroups, getActiveTab } from './settings-routes'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DataPw } from '@/components/shared/data-pw'

export function SettingsNav() {
  const t = useTranslations()
  const pathname = usePathname()
  const activeTab = getActiveTab(pathname)

  if (!activeTab) return null

  const menuItems: EntityMenubarItem[] = tabGroups.map(({ value, label, items }) => ({
    key: value,
    active: value === activeTab,
    content: (
      <DataPw
        dataPw={`settings-nav-${value}-tab`}
        as='span'
      >
        {t(label)}
      </DataPw>
    ),
    dropdownItems: items.map(({ href, label: itemLabel, dataPw }) => ({
      key: href,
      active: isActivePath(pathname, href),
      content: (
        <DataPw
          dataPw={dataPw}
          as={Link}
          href={href}
          prefetch={false}
          aria-current={isActivePath(pathname, href) ? 'page' : undefined}
        >
          {t(itemLabel)}
        </DataPw>
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
