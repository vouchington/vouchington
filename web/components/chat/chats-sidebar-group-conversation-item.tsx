'use client'

import Link from 'next/link'
import { EntityActionIcons } from '@/components/shared/entity-action-icons'
import { SidebarMenuAction, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { chatHref } from '@/lib/links/entity-href'
import { isActivePath } from '@/lib/utils/path'
import type { ChatConversation } from '@/types/chat'
import { useTranslations } from '@/lib/i18n/use-translations'

const EditChatIcon = EntityActionIcons.edit
const DeleteChatIcon = EntityActionIcons.delete

interface Props {
  conversation: ChatConversation
  pathname: string
  deletingId: string | null
  onDelete: (event: React.MouseEvent, conversationId: string) => void
  onEditStart: (conversationId: string, currentTitle: string) => void
}

export function ChatConversationItem({
  conversation,
  pathname,
  deletingId,
  onDelete,
  onEditStart,
}: Props) {
  const t = useTranslations()
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActivePath(pathname, chatHref(conversation))}
        className='peer/menu-button'
      >
        <Link
          href={chatHref(conversation)}
          prefetch={false}
          title={conversation.title}
          data-pw='chat-conversation-link'
        >
          <span className='truncate'>
            {conversation.title ||
              t('extracted.chat.chatsSidebarGroupConversationItem.untitled_f59ab8d1')}
          </span>
        </Link>
      </SidebarMenuButton>
      <SidebarMenuAction
        type='button'
        showOnHover
        aria-label={t('extracted.chat.chatsSidebarGroupConversationItem.renameChat_26076241')}
        onClick={() => onEditStart(conversation.id, conversation.title || '')}
        data-pw='chat-rename-button'
        className='right-7'
      >
        <EditChatIcon />
      </SidebarMenuAction>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <SidebarMenuAction
            type='button'
            showOnHover
            aria-label={t('extracted.chat.chatsSidebarGroupConversationItem.deleteChat_93291d9c')}
            data-pw='chat-delete-button'
          >
            <DeleteChatIcon />
          </SidebarMenuAction>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('extracted.chat.chatsSidebarGroupConversationItem.deleteThisChat_848dad9b')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('extracted.chat.chatsSidebarGroupConversationItem.thisCannotBeUndone_b545dd16')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={deletingId === conversation.id}
              data-pw='chat-delete-cancel-button'
            >
              {t('extracted.chat.chatsSidebarGroupConversationItem.cancel_19766ed6')}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingId === conversation.id}
              onClick={event => onDelete(event, conversation.id)}
              data-pw='chat-delete-confirm-button'
            >
              {deletingId === conversation.id
                ? t('extracted.chat.chatsSidebarGroupConversationItem.deleting_685ecb98')
                : t('extracted.chat.chatsSidebarGroupConversationItem.delete_e2d0a549')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarMenuItem>
  )
}
