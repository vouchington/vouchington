'use client'

import Link from 'next/link'
import { Plus, ChevronDown, Headset } from 'lucide-react'
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
import type { ChatConversation } from '@/types/chat'
import { EditingInput } from './chats-sidebar-group-editing-input'
import { ChatConversationItem } from './chats-sidebar-group-conversation-item'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  conversations: ChatConversation[]
  pathname: string
  deletingId: string | null
  editingId: string | null
  editValue: string
  showSupport: boolean
  onDelete: (event: React.MouseEvent, conversationId: string) => void
  onEditStart: (conversationId: string, currentTitle: string) => void
  onEditChange: (value: string) => void
  onEditSave: (conversationId: string) => void
  onEditCancel: () => void
}

export function ChatsSidebarGroupView({
  conversations,
  pathname,
  deletingId,
  editingId,
  editValue,
  showSupport,
  onDelete,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
}: Props) {
  const t = useTranslations()
  return (
    <>
      <Collapsible
        defaultOpen
        className='group'
        data-pw='chat-sidebar-group'
      >
        <SidebarGroup>
          <SidebarGroupLabel asChild>
            <CollapsibleTrigger className='cursor-pointer'>
              {t('extracted.chat.chatsSidebarGroupView.chats_ef5b4049')}
              <ChevronDown className='ml-auto size-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90' />
            </CollapsibleTrigger>
          </SidebarGroupLabel>
          <CollapsibleContent>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === '/chat'}
                  >
                    <Link
                      href='/chat'
                      prefetch={false}
                      data-pw='chat-new-chat-link'
                    >
                      <Plus />
                      <span>{t('extracted.chat.chatsSidebarGroupView.newChat_0d332351')}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {conversations.map(conversation =>
                  editingId === conversation.id ? (
                    <SidebarMenuItem key={conversation.id}>
                      <EditingInput
                        conversationId={conversation.id}
                        editValue={editValue}
                        onEditChange={onEditChange}
                        onEditSave={onEditSave}
                        onEditCancel={onEditCancel}
                      />
                    </SidebarMenuItem>
                  ) : (
                    <ChatConversationItem
                      key={conversation.id}
                      conversation={conversation}
                      pathname={pathname}
                      deletingId={deletingId}
                      onDelete={onDelete}
                      onEditStart={onEditStart}
                    />
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </CollapsibleContent>
        </SidebarGroup>
      </Collapsible>
      {showSupport ? (
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={isActivePath(pathname, '/chat/support')}
                >
                  <Link
                    href='/chat/support'
                    prefetch={false}
                    data-pw='chat-support-link'
                  >
                    <Headset />
                    <span>{t('extracted.chat.chatsSidebarGroupView.support_be91940b')}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ) : null}
    </>
  )
}
