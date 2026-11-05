'use client'

import { useEffect, useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Compass, Plus } from 'lucide-react'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { isActivePath } from '@/lib/utils/path'
import { searchMyCommunities } from '@/lib/api/client/communities'
import { communityHref } from '@/lib/links/entity-href'
import type { Community } from '@/types/api-responses'
import { COMMUNITIES_INTENT } from '@/lib/navigation/intents/product-social'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DataPw } from '@/components/shared/data-pw'

const bookmarksGroup = COMMUNITIES_INTENT.groups.find(g => g.dataPw === 'sidebar-group-bookmarks')

export function CommunitiesSidebarGroup() {
  const t = useTranslations()
  const pathname = usePathname()
  const [myCommunities, setMyCommunities] = useState<Community[]>([])

  useEffect(() => {
    let cancelled = false
    searchMyCommunities(10)
      .then(result => {
        if (!cancelled) {
          const communities = result.results.flatMap(r =>
            result.communities[r.id] != null ? [result.communities[r.id] as Community] : [],
          )
          const fetchedIds = new Set(communities.map(c => c.id))
          setMyCommunities(prev => {
            const prepended = prev.filter(c => !fetchedIds.has(c.id))
            return [...prepended, ...communities]
          })
        }
      })
      .catch(Sentry.captureException)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleCommunityCreated(e: CustomEvent<Community>) {
      setMyCommunities(prev => [e.detail, ...prev])
    }
    window.addEventListener('communities:created', handleCommunityCreated as EventListener)
    return () => {
      window.removeEventListener('communities:created', handleCommunityCreated as EventListener)
    }
  }, [])

  return (
    <>
      <SidebarGroup data-pw='sidebar-group-communities-explore'>
        <SidebarGroupLabel>
          {t('extracted.communities.communitiesSidebarGroup.explore_3b73900b')}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/communities'}
              >
                <Link
                  href='/communities'
                  prefetch={false}
                  data-pw='sidebar-explore-communities-link'
                >
                  <Compass />
                  <span>
                    {t('extracted.communities.communitiesSidebarGroup.exploreCommunities_538c18f3')}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === '/communities/create'}
              >
                <Link
                  href='/communities/create'
                  prefetch={false}
                  data-pw='sidebar-create-community-link'
                >
                  <Plus />
                  <span>
                    {t('extracted.communities.communitiesSidebarGroup.createCommunity_62cdc055')}
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
      {bookmarksGroup && (
        <DataPw
          dataPw={bookmarksGroup.dataPw}
          as={SidebarGroup}
        >
          <SidebarGroupLabel>{t(bookmarksGroup.label)}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {bookmarksGroup.items.map(item => (
                <SidebarMenuItem key={item.dataPw}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.href}
                  >
                    <DataPw
                      href={item.href}
                      prefetch={false}
                      dataPw={item.dataPw}
                      as={Link}
                    >
                      <span>{t(item.label)}</span>
                    </DataPw>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </DataPw>
      )}
      {myCommunities.length > 0 && (
        <SidebarGroup data-pw='sidebar-group-my-communities'>
          <SidebarGroupLabel>
            {t('extracted.communities.communitiesSidebarGroup.myCommunities_5bec7a9e')}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {myCommunities.map(community => (
                <SidebarMenuItem key={community.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(pathname, communityHref(community))}
                  >
                    <Link
                      href={communityHref(community)}
                      prefetch={false}
                      title={community.name}
                    >
                      <Users />
                      <span className='truncate'>{community.name}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </>
  )
}
