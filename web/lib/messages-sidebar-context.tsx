'use client'

import { createContext, use } from 'react'
import type { DirectConversation, DirectConversationsResponse } from '@/types/messages'

export type MessagesSidebarPageInfo = DirectConversationsResponse['page_info']

export interface MessagesSidebarContextValue {
  conversations: DirectConversation[]
  pageInfo: MessagesSidebarPageInfo | null
  isLoaded: boolean
  replaceFirstPage: (conversations: DirectConversation[], pageInfo: MessagesSidebarPageInfo) => void
  appendPage: (conversations: DirectConversation[], pageInfo: MessagesSidebarPageInfo) => void
  prependConversation: (conversation: DirectConversation) => void
}

export const MessagesSidebarContext = createContext<MessagesSidebarContextValue | null>(null)

export function useOptionalMessagesSidebar(): MessagesSidebarContextValue | null {
  return use(MessagesSidebarContext)
}
