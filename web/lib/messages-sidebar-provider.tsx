'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/lib/auth/context'
import type { DirectConversation } from '@/types/messages'
import { MessagesSidebarContext, type MessagesSidebarPageInfo } from './messages-sidebar-context'

export function MessagesSidebarProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<DirectConversation[]>([])
  const [pageInfo, setPageInfo] = useState<MessagesSidebarPageInfo | null>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const replaceFirstPage = useCallback(
    (next: DirectConversation[], info: MessagesSidebarPageInfo) => {
      setConversations(prev => {
        const serverIds = new Set(next.map(conversation => conversation.id))
        return dedupeConversations([...prev.filter(c => !serverIds.has(c.id)), ...next])
      })
      setPageInfo(info)
      setIsLoaded(true)
    },
    [],
  )
  const appendPage = useCallback((next: DirectConversation[], info: MessagesSidebarPageInfo) => {
    setConversations(prev => dedupeConversations([...prev, ...next]))
    setPageInfo(info)
    setIsLoaded(true)
  }, [])
  const prependConversation = useCallback((conversation: DirectConversation) => {
    setConversations(prev => dedupeConversations([conversation, ...prev]))
  }, [])
  const value = useMemo(
    () => ({
      conversations,
      pageInfo,
      isLoaded,
      replaceFirstPage,
      appendPage,
      prependConversation,
    }),
    [conversations, pageInfo, isLoaded, replaceFirstPage, appendPage, prependConversation],
  )
  return <MessagesSidebarContext.Provider value={value}>{children}</MessagesSidebarContext.Provider>
}

export function SignedInMessagesSidebarProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  return isAuthenticated ? <MessagesSidebarProvider>{children}</MessagesSidebarProvider> : children
}

function dedupeConversations(conversations: DirectConversation[]): DirectConversation[] {
  const seen = new Set<string>()
  return conversations.filter(conversation => {
    if (seen.has(conversation.id)) return false
    seen.add(conversation.id)
    return true
  })
}
