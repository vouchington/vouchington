/* oxlint-disable no-mistakes/playwright-literals -- Sidebar nav IDs come from intent config data; ast-grep still bans inline calls in data-pw. */
'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import type { NavGroup } from '@/lib/navigation/intents'
import { getNavIcon, isNavItemActive } from '@/lib/navigation/sidebar-nav'
import { useTranslations } from '@/lib/i18n/use-translations'

type AppSidebarNavGroupProps = {
  group: NavGroup
  pathname: string
  isAuthenticated: boolean
}

export function AppSidebarNavGroup({ group, pathname, isAuthenticated }: AppSidebarNavGroupProps) {
  const t = useTranslations()
  const visibleItems = group.items.filter(item => !item.requiresAuth || isAuthenticated)

  return (
    <Collapsible
      key={group.label}
      defaultOpen
      className='group'
    >
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger
            className='cursor-pointer'
            data-pw={group.dataPw}
          >
            {t(group.label)}
            <ChevronDown className='ml-auto size-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90' />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map(item => {
                if (item.comingSoon) {
                  return (
                    <SidebarMenuItem key={item.dataPw}>
                      <SidebarMenuButton
                        aria-disabled='true'
                        data-pw={item.dataPw}
                        className='cursor-not-allowed opacity-50'
                      >
                        <span>{t(item.label)}</span>
                        <span className='ml-auto text-xs text-muted-foreground'>
                          {t('extracted.appSidebar.navSection.soon_cf0ee354')}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                }

                const Icon = getNavIcon(item.href)

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={isNavItemActive(
                        item.href,
                        pathname,
                        item.exact,
                        item.excludePathPrefixes,
                      )}
                    >
                      <Link
                        href={item.href}
                        data-pw={item.dataPw}
                        prefetch={false}
                      >
                        <Icon />
                        <span>{t(item.label)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
