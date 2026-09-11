'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/lib/auth/context'
import type { ChatConversation } from '@/types/chat'
import { ChatSidebarContext, type ChatSidebarPageInfo } from './use-chat-sidebar'

export function ChatSidebarProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [pageInfo, setPageInfo] = useState<ChatSidebarPageInfo | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)

  const replaceFirstPage = useCallback(
    (nextConversations: ChatConversation[], nextPageInfo: ChatSidebarPageInfo) => {
      setConversations(prev => {
        const serverConversationIds = new Set(
          nextConversations.map(conversation => conversation.id),
        )
        return dedupeConversations([
          ...prev.filter(conversation => !serverConversationIds.has(conversation.id)),
          ...nextConversations,
        ])
      })
      setPageInfo(nextPageInfo)
      setIsLoaded(true)
    },
    [],
  )

  const appendPage = useCallback(
    (nextConversations: ChatConversation[], nextPageInfo: ChatSidebarPageInfo) => {
      setConversations(prev => dedupeConversations([...prev, ...nextConversations]))
      setPageInfo(nextPageInfo)
      setIsLoaded(true)
    },
    [],
  )

  const prependConversation = useCallback((conversation: ChatConversation) => {
    setConversations(prev => dedupeConversations([conversation, ...prev]))
  }, [])

  const removeConversation = useCallback((conversationId: string) => {
    setConversations(prev => prev.filter(conversation => conversation.id !== conversationId))
  }, [])

  const updateConversation = useCallback(
    (conversationId: string, changes: Partial<ChatConversation>) => {
      setConversations(prev =>
        prev.map(conv => (conv.id === conversationId ? { ...conv, ...changes } : conv)),
      )
    },
    [],
  )

  const value = useMemo(
    () => ({
      conversations,
      pageInfo,
      isLoaded,
      replaceFirstPage,
      appendPage,
      prependConversation,
      removeConversation,
      updateConversation,
    }),
    [
      conversations,
      pageInfo,
      isLoaded,
      replaceFirstPage,
      appendPage,
      prependConversation,
      removeConversation,
      updateConversation,
    ],
  )

  return <ChatSidebarContext.Provider value={value}>{children}</ChatSidebarContext.Provider>
}

export function SignedInChatSidebarProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return children
  return <ChatSidebarProvider>{children}</ChatSidebarProvider>
}

function dedupeConversations(conversations: ChatConversation[]): ChatConversation[] {
  const seen = new Set<string>()
  return conversations.filter(conversation => {
    if (seen.has(conversation.id)) return false
    seen.add(conversation.id)
    return true
  })
}
