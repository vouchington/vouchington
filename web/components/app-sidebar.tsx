'use client'

import type { ComponentProps, ReactNode } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { PanelLeft } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { NAV_INTENTS, type NavGroup } from '@/lib/navigation/intents'
import { useResolvedIntent } from '@/lib/navigation/intents/nav-intent-context'
import { useAuth } from '@/lib/auth/context'
import { useIsMac } from '@/hooks/use-is-mac'
import { AppSidebarNavGroup } from './app-sidebar/nav-section'
import { IntentSwitcher } from './navbar/intent-switcher'
import { useFeatureFlags } from '@/lib/feature-flags/use-feature-flags'
import type { CommunitiesSidebarGroup as CommunitiesSidebarGroupComponent } from './communities/communities-sidebar-group'
import type { ListsSidebarGroup as ListsSidebarGroupComponent } from './lists/lists-sidebar-group'
import type { MessagesSidebarGroup as MessagesSidebarGroupComponent } from './messages/messages-sidebar-group'

const MessagesSidebarGroup = dynamic<ComponentProps<typeof MessagesSidebarGroupComponent>>(
  () =>
    import('./messages/messages-sidebar-group').then(m => ({ default: m.MessagesSidebarGroup })),
  { ssr: false },
)

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const CommunitiesSidebarGroup = dynamic<ComponentProps<typeof CommunitiesSidebarGroupComponent>>(
  () =>
    import('./communities/communities-sidebar-group').then(m => ({
      default: m.CommunitiesSidebarGroup,
    })),
)

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const ListsSidebarGroup = dynamic<ComponentProps<typeof ListsSidebarGroupComponent>>(() =>
  import('./lists/lists-sidebar-group').then(m => ({ default: m.ListsSidebarGroup })),
)

function shouldShowGroup(group: NavGroup, userRoles: readonly string[], isAuthenticated: boolean) {
  if (group.requiresAuth && !isAuthenticated) return false
  if (group.roles && group.roles.length > 0) {
    return group.roles.some(role => userRoles.includes(role))
  }
  return true
}

export function AppSidebar({ siteFooter }: { siteFooter?: ReactNode }) {
  const { currentUser, isAuthenticated } = useAuth()
  const { toggleSidebar } = useSidebar()
  const pathname = usePathname()
  const isMac = useIsMac()
  const featureFlags = useFeatureFlags()
  const userRoles: readonly string[] = currentUser?.roles ?? []
  const activeIntentId = useResolvedIntent(pathname) ?? 'news'
  const visibleIntents = NAV_INTENTS.filter(
    intent => !intent.featureFlag || featureFlags[intent.featureFlag] === true,
  )
  // NAV_INTENTS always has at least one entry (the 'news' intent is always first).
  const activeIntent = (visibleIntents.find(intent => intent.id === activeIntentId) ??
    visibleIntents[0] ??
    NAV_INTENTS[0])!

  const visibleGroups = activeIntent.groups.filter(group =>
    shouldShowGroup(group, userRoles, isAuthenticated),
  )

  const isCommunitiesIntent = activeIntentId === 'communities'
  const isMessagesIntent = activeIntentId === 'messages'
  const isListsIntent = activeIntentId === 'lists'

  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              type='button'
              size='sm'
              onClick={toggleSidebar}
              data-pw='app-sidebar-trigger'
            >
              <PanelLeft />
              <kbd className='pointer-events-none ml-auto flex h-5 shrink-0 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-xs font-medium'>
                {isMac ? '⌘/' : 'Ctrl+/'}
              </kbd>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <IntentSwitcher variant='sidebar' />
      </SidebarHeader>
      <SidebarContent>
        {/* Suppress static groups for authenticated Communities/Messages/Lists intents — their dynamic sidebar groups below fully own the nav. */}
        {!((isCommunitiesIntent || isMessagesIntent || isListsIntent) && isAuthenticated) &&
          visibleGroups.map(group => (
            <AppSidebarNavGroup
              key={group.dataPw}
              group={group}
              pathname={pathname}
              isAuthenticated={isAuthenticated}
            />
          ))}
        {isCommunitiesIntent && (isAuthenticated ? <CommunitiesSidebarGroup /> : null)}
        {isMessagesIntent && isAuthenticated ? <MessagesSidebarGroup /> : null}
        {isListsIntent && isAuthenticated ? <ListsSidebarGroup /> : null}
        <div className='mt-auto'>{siteFooter}</div>
      </SidebarContent>
    </Sidebar>
  )
}
