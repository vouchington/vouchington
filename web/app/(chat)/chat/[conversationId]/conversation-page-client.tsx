'use client'

import { Suspense, useState, useEffect, useCallback, useEffectEvent, useRef } from 'react'
import * as Sentry from '@sentry/nextjs'
import { usePathname, useSearchParams } from 'next/navigation'
import { ChatLayout } from '@/components/chat/chat-layout'
import { ChatMessages } from '@/components/chat/chat-messages'
import { ChatInput } from '@/components/chat/chat-input'
import { useChatStream } from '@/hooks/use-chat-stream'
import { generateConversationTitle, updateConversationTitle } from '@/lib/api/client/conversations'
import { useOptionalChatSidebar } from '@/lib/use-chat-sidebar'
import type { ChatMessage } from '@/types/chat'

interface Props {
  conversationId: string
  initialMessages: ChatMessage[]
}

const PENDING_MESSAGE_EVENT = 'chat:pending-message'

export function ConversationPageClient({ conversationId, initialMessages }: Props) {
  const activeConversationId = getActiveConversationId(usePathname())
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const chatSidebar = useOptionalChatSidebar()
  const isFirstExchangeRef = useRef(initialMessages.length === 0)
  const updateSidebarTitle = useEffectEvent((convId: string) => {
    const lastUserMsg = messages.findLast(m => m.content.role === 'user')
    const fallbackTitle =
      lastUserMsg?.content.role === 'user' ? lastUserMsg.content.content.slice(0, 100) : ''
    generateConversationTitle(convId)
      .then(({ conversation }) => {
        chatSidebar?.updateConversation(convId, { title: conversation.title })
      })
      .catch(() => {
        if (fallbackTitle) {
          const currentTitle = chatSidebar?.conversations.find(c => c.id === convId)?.title
          if (!currentTitle?.trim()) {
            chatSidebar?.updateConversation(convId, { title: fallbackTitle })
            updateConversationTitle(convId, fallbackTitle).catch(Sentry.captureException)
          }
        }
      })
  })
  const {
    sendMessage,
    isStreaming,
    streamedContent,
    toolCalls,
    subagentSteps,
    subagentTextChunks,
    metadata,
    error,
    abort,
  } = useChatStream()

  const handleSend = useCallback(
    async (message: string) => {
      const userMessage: ChatMessage = {
        id: `optimistic-${Date.now()}`,
        conversation_id: conversationId,
        created_at: new Date().toISOString(),
        created_by_id: '',
        updated_at: new Date().toISOString(),
        updated_by_id: null,
        deleted_at: null,
        deleted_by_id: null,
        content: { role: 'user', content: message },
      }
      setMessages(prev => [...prev, userMessage])
      await sendMessage(conversationId, message)
    },
    [conversationId, sendMessage],
  )
  const sendPendingMessage = useEffectEvent((pendingConversationId: string, message: string) => {
    if (pendingConversationId !== conversationId) return
    handleSend(message).catch(Sentry.captureException)
  })

  useEffect(() => {
    function handlePendingMessage(event: Event) {
      if (!(event instanceof CustomEvent)) return
      if (typeof event.detail?.conversationId !== 'string') return
      if (typeof event.detail.message !== 'string') return
      sendPendingMessage(event.detail.conversationId, event.detail.message)
    }
    window.addEventListener(PENDING_MESSAGE_EVENT, handlePendingMessage)
    return () => window.removeEventListener(PENDING_MESSAGE_EVENT, handlePendingMessage)
  }, [])

  useEffect(() => {
    if (isStreaming) return
    if (error && metadata.messageId) {
      const errorMessage: ChatMessage = {
        id: metadata.messageId,
        conversation_id: conversationId,
        created_at: new Date().toISOString(),
        created_by_id: '',
        updated_at: new Date().toISOString(),
        updated_by_id: null,
        deleted_at: null,
        deleted_by_id: null,
        content: {
          role: 'assistant',
          content: streamedContent.trim() ? streamedContent : null,
          error,
        },
      }
      queueMicrotask(() => setMessages(prev => [...prev, errorMessage]))
    } else if (!error && streamedContent?.trim()) {
      const assistantMessage: ChatMessage = {
        id: `streamed-${Date.now()}`,
        conversation_id: conversationId,
        created_at: new Date().toISOString(),
        created_by_id: '',
        updated_at: new Date().toISOString(),
        updated_by_id: null,
        deleted_at: null,
        deleted_by_id: null,
        content: { role: 'assistant', content: streamedContent },
      }
      queueMicrotask(() => setMessages(prev => [...prev, assistantMessage]))
      if (isFirstExchangeRef.current) {
        isFirstExchangeRef.current = false
        updateSidebarTitle(conversationId)
      }
    }
  }, [isStreaming, streamedContent, error, metadata.messageId, conversationId])

  return (
    <ChatLayout>
      <ChatMessages
        messages={messages}
        streamedContent={isStreaming ? streamedContent : undefined}
        streamingToolCalls={isStreaming ? toolCalls : undefined}
        subagentSteps={isStreaming ? subagentSteps : undefined}
        subagentTextChunks={isStreaming ? subagentTextChunks : undefined}
        isStreaming={isStreaming}
      />
      <>
        {activeConversationId === conversationId && (
          <Suspense fallback={null}>
            <PendingMessageEmitter />
          </Suspense>
        )}
        {error && !metadata.messageId && (
          <div className='mx-4 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive'>
            {error}
          </div>
        )}
        <ChatInput
          onSend={handleSend}
          isStreaming={isStreaming}
          onAbort={abort}
        />
      </>
    </ChatLayout>
  )
}

function PendingMessageEmitter() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const hasEmittedRef = useRef(false)
  const activeConversationId = getActiveConversationId(pathname)

  useEffect(() => {
    const pendingMessage = searchParams.get('message')
    if (!pendingMessage || hasEmittedRef.current) return
    if (!activeConversationId) return
    hasEmittedRef.current = true
    const url = new URL(window.location.href)
    url.searchParams.delete('message')
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
    queueMicrotask(() =>
      window.dispatchEvent(
        new CustomEvent(PENDING_MESSAGE_EVENT, {
          detail: { conversationId: activeConversationId, message: pendingMessage },
        }),
      ),
    )
  }, [activeConversationId, searchParams])

  return null
}

function getActiveConversationId(pathname: string) {
  const match = /^\/chat\/([^/]+)\/?$/.exec(pathname)
  if (!match) return null
  const rawConversationId = match[1]
  if (!rawConversationId) return null
  try {
    return decodeURIComponent(rawConversationId)
  } catch {
    return rawConversationId
  }
}
