'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BookMarked, Plus } from 'lucide-react'
import * as Sentry from '@sentry/nextjs'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { isActivePath } from '@/lib/utils/path'
import { searchMyLists } from '@/lib/api/client/lists'
import { listHref } from '@/lib/links/entity-href'
import type { List } from '@/types/api-responses'
import { useTranslations } from '@/lib/i18n/use-translations'

export function ListsSidebarGroup() {
  const t = useTranslations()
  const pathname = usePathname()
  const [myLists, setMyLists] = useState<List[]>([])

  useEffect(() => {
    let cancelled = false
    searchMyLists(10)
      .then(result => {
        if (!cancelled) {
          const lists = result.results.flatMap(r =>
            result.lists[r.id] != null ? [result.lists[r.id] as List] : [],
          )
          const fetchedIds = new Set(lists.map(l => l.id))
          setMyLists(prev => {
            const prepended = prev.filter(l => !fetchedIds.has(l.id))
            return [...prepended, ...lists]
          })
        }
      })
      .catch(Sentry.captureException)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    function handleListCreated(e: CustomEvent<List>) {
      setMyLists(prev => [e.detail, ...prev])
    }
    window.addEventListener('lists:created', handleListCreated as EventListener)
    return () => {
      window.removeEventListener('lists:created', handleListCreated as EventListener)
    }
  }, [])

  return (
    <SidebarGroup data-pw='sidebar-group-lists'>
      <SidebarGroupLabel>
        <Link
          href='/my/lists'
          prefetch={false}
          data-pw='sidebar-nav-my-lists'
        >
          {t('extracted.lists.listsSidebarGroup.myLists_94de1d96')}
        </Link>
        <SidebarMenuButton
          asChild
          size='sm'
        >
          <Link
            href='/my/lists?create=1'
            prefetch={false}
            aria-label={t('extracted.lists.listsSidebarGroup.createNewList_3fb9aa9b')}
          >
            <Plus />
          </Link>
        </SidebarMenuButton>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {myLists.map(list => (
            <SidebarMenuItem key={list.id}>
              <SidebarMenuButton
                asChild
                isActive={isActivePath(pathname, listHref(list))}
              >
                <Link
                  href={listHref(list)}
                  prefetch={false}
                  title={list.name}
                >
                  <BookMarked />
                  <span className='truncate'>{list.name}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
