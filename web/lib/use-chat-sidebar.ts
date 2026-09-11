'use client'

import { createContext, use } from 'react'
import type { ChatConversation, ChatConversationsResponseBody } from '@/types/chat'

export type ChatSidebarPageInfo = ChatConversationsResponseBody['page_info']
export interface ChatSidebarContextValue {
  conversations: ChatConversation[]
  pageInfo: ChatSidebarPageInfo | null
  isLoaded: boolean
  replaceFirstPage: (conversations: ChatConversation[], pageInfo: ChatSidebarPageInfo) => void
  appendPage: (conversations: ChatConversation[], pageInfo: ChatSidebarPageInfo) => void
  prependConversation: (conversation: ChatConversation) => void
  removeConversation: (conversationId: string) => void
  updateConversation: (conversationId: string, changes: Partial<ChatConversation>) => void
}

export const ChatSidebarContext = createContext<ChatSidebarContextValue | null>(null)

export function useChatSidebar(): ChatSidebarContextValue {
  const context = use(ChatSidebarContext)
  if (!context) throw new Error('useChatSidebar must be used within ChatSidebarProvider')
  return context
}

export function useOptionalChatSidebar(): ChatSidebarContextValue | null {
  return use(ChatSidebarContext)
}
