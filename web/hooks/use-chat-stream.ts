'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { sendConversationChatStream } from '@/lib/api/client/conversation-stream'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ChatSSEEventToolCall, ChatSSESubagentStep, ChatSSESubagentText } from '@/types/chat'
import { ChatStreamIncompleteError, readChatStreamResponse } from './chat-stream-reader'

export interface UseChatStreamResult {
  sendMessage: (conversationId: string, message: string) => Promise<void>
  isStreaming: boolean
  streamedContent: string
  toolCalls: ChatSSEEventToolCall[]
  subagentSteps: ChatSSESubagentStep[]
  subagentTextChunks: ChatSSESubagentText[]
  metadata: { conversationId?: string; messageId?: string }
  error: string | null
  abort: () => void
}

export function useChatStream(): UseChatStreamResult {
  const t = useTranslations()
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamedContent, setStreamedContent] = useState('')
  const [toolCalls, setToolCalls] = useState<ChatSSEEventToolCall[]>([])
  const [subagentSteps, setSubagentSteps] = useState<ChatSSESubagentStep[]>([])
  const [subagentTextChunks, setSubagentTextChunks] = useState<ChatSSESubagentText[]>([])
  const [metadata, setMetadata] = useState<{ conversationId?: string; messageId?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  const abort = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  useEffect(
    () => () => {
      requestIdRef.current += 1
      abort()
      abortControllerRef.current = null
    },
    [abort],
  )

  const sendMessage = useCallback(
    async (conversationId: string, message: string) => {
      abortControllerRef.current?.abort()
      const controller = new AbortController()
      const requestId = requestIdRef.current + 1
      requestIdRef.current = requestId
      abortControllerRef.current = controller
      function isLatestRequest(): boolean {
        return requestIdRef.current === requestId
      }
      function mayApplyEvents(): boolean {
        return isLatestRequest() && !controller.signal.aborted
      }

      setIsStreaming(true)
      setStreamedContent('')
      setToolCalls([])
      setSubagentSteps([])
      setSubagentTextChunks([])
      setMetadata({})
      setError(null)

      try {
        const response = await sendConversationChatStream(
          conversationId,
          message,
          controller.signal,
        )
        await readChatStreamResponse(response, {
          isCurrentRequest: mayApplyEvents,
          setError,
          setMetadata,
          appendContent: content => setStreamedContent(prev => prev + content),
          appendToolCall: toolCall => setToolCalls(prev => [...prev, toolCall]),
          appendSubagentStep: step => setSubagentSteps(prev => [...prev, step]),
          appendSubagentText: chunk => setSubagentTextChunks(prev => [...prev, chunk]),
        })
      } catch (error) {
        if (controller.signal.aborted) return
        if (isLatestRequest()) {
          setError(
            error instanceof ChatStreamIncompleteError
              ? t('extracted.chat.chatMessages.responseInterrupted_761e02ca')
              : error instanceof Error
                ? error.message
                : 'Unknown error',
          )
        }
      } finally {
        if (isLatestRequest()) {
          setIsStreaming(false)
          abortControllerRef.current = null
        }
      }
    },
    [t],
  )

  return {
    sendMessage,
    isStreaming,
    streamedContent,
    toolCalls,
    subagentSteps,
    subagentTextChunks,
    metadata,
    error,
    abort,
  }
}
