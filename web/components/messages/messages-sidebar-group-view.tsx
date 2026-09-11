'use client'

import Link from 'next/link'
import { ChevronDown, Mail } from 'lucide-react'
import { messagesHref } from '@/lib/links/entity-href'
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { isActivePath } from '@/lib/utils/path'
import type { DirectConversation } from '@/types/messages'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  conversations: DirectConversation[]
  pathname: string
}

export function MessagesSidebarGroupView({ conversations, pathname }: Props) {
  const t = useTranslations()
  return (
    <Collapsible
      defaultOpen
      className='group'
      data-pw='messages-sidebar-group'
    >
      <SidebarGroup>
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className='cursor-pointer'>
            {t('extracted.messages.messagesSidebarGroupView.messages_04d7b483')}
            <ChevronDown className='ml-auto size-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90' />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === '/messages'}
                >
                  <Link
                    href='/messages'
                    prefetch={false}
                    data-pw='messages-all-link'
                  >
                    <Mail />
                    <span>
                      {t('extracted.messages.messagesSidebarGroupView.allMessages_020dc04d')}
                    </span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {conversations.map(conversation => (
                <SidebarMenuItem key={conversation.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(pathname, messagesHref(conversation.id))}
                  >
                    <Link
                      href={messagesHref(conversation.id)}
                      prefetch={false}
                      data-pw='messages-conversation-link'
                    >
                      <span className='truncate'>{conversation.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
