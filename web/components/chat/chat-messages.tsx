'use client'

import { useEffect, useRef } from 'react'
import type {
  ChatMessage,
  ChatSSEEventToolCall,
  ChatSSESubagentStep,
  ChatSSESubagentText,
} from '@/types/chat'
import { ChatToolCall } from './chat-tool-call'
import { ChatSubagentProgress } from './chat-subagent-progress'
import { useTranslations } from '@/lib/i18n/use-translations'

interface MessageContent {
  role?: string
  content?: string | null
  error?: string
}

function renderMessageBubble(message: ChatMessage) {
  const content = message.content as MessageContent | null
  if (!content?.role) return null
  // Skip assistant placeholders with no content and no error (e.g. aborted streams) so no
  // empty or misleading bubble appears. Only render when there is actual content or an error.
  if (content.role === 'assistant' && !content.error && !content.content?.trim()) return null
  return (
    <div
      key={message.id}
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
      data-pw={`chat-message-${content.role === 'user' ? 'user' : 'assistant'}`}
      className={`flex ${content.role === 'user' ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[80%] rounded-lg px-4 py-2 ${
          content.role === 'user'
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        }`}
      >
        {content.content?.trim() && (
          <p
            className='whitespace-pre-wrap text-sm'
            data-pw='chat-message-content'
          >
            {content.content}
          </p>
        )}
        {content.error && (
          <p
            className='mt-1 text-destructive text-sm'
            data-pw='chat-message-error'
          >
            {content.error}
          </p>
        )}
      </div>
    </div>
  )
}

interface Props {
  messages: ChatMessage[]
  streamedContent?: string
  streamingToolCalls?: ChatSSEEventToolCall[]
  subagentSteps?: ChatSSESubagentStep[]
  subagentTextChunks?: ChatSSESubagentText[]
  isStreaming?: boolean
}

export function ChatMessages({
  messages,
  streamedContent,
  streamingToolCalls,
  subagentSteps,
  subagentTextChunks,
  isStreaming,
}: Props) {
  const t = useTranslations()
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: isStreaming ? 'instant' : 'smooth' })
  }, [messages, streamedContent, subagentTextChunks, isStreaming])

  const isEmpty = messages.length === 0 && !isStreaming

  return (
    <div
      aria-label={isEmpty ? undefined : t('nav.messages')}
      aria-live={isStreaming ? 'off' : undefined}
      data-pw='chat-messages'
      role={isEmpty ? undefined : 'log'}
      tabIndex={isEmpty ? undefined : 0}
      className={
        isEmpty
          ? 'flex flex-1 items-center justify-center p-8'
          : 'flex flex-1 flex-col gap-4 overflow-y-auto p-4 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring'
      }
    >
      {isEmpty ? (
        <div className='text-center text-muted-foreground'>
          <p
            className='text-lg font-medium'
            data-pw='chat-empty-state-title'
          >
            {t('extracted.chat.chatMessages.startAConversation_258150cb')}
          </p>
          <p className='text-sm'>
            {t('extracted.chat.chatMessages.askAnythingAboutCreditCardsRewards_5997083b')}
          </p>
        </div>
      ) : (
        <>
          {messages.map(renderMessageBubble)}

          {isStreaming && (
            <div className='flex justify-start'>
              <div className='max-w-[80%] rounded-lg bg-muted px-4 py-2 text-foreground'>
                {subagentSteps && subagentSteps.length > 0 && (
                  <ChatSubagentProgress steps={subagentSteps} />
                )}
                {streamingToolCalls && streamingToolCalls.length > 0 && (
                  <div className='mb-2 flex flex-col gap-1'>
                    {streamingToolCalls.map(toolCall => (
                      <ChatToolCall
                        key={toolCall.tool_call_id}
                        toolCall={toolCall}
                      />
                    ))}
                  </div>
                )}
                {subagentTextChunks && subagentTextChunks.length > 0 && (
                  <div className='mb-2 space-y-1 text-xs text-muted-foreground'>
                    {Object.values(
                      subagentTextChunks.reduce<
                        Record<
                          string,
                          { agent_name: string; tool_call_id: string; content: string }
                        >
                      >((acc, chunk) => {
                        const key = `${chunk.agent_name}-${chunk.tool_call_id ?? 'child'}`
                        if (!acc[key]) {
                          acc[key] = {
                            agent_name: chunk.agent_name,
                            tool_call_id: chunk.tool_call_id ?? 'child',
                            content: '',
                          }
                        }
                        acc[key].content += chunk.content
                        return acc
                      }, {}),
                    ).map(group => (
                      <p
                        key={`${group.agent_name}-${group.tool_call_id}`}
                        className='whitespace-pre-wrap'
                      >
                        <span className='font-semibold'>
                          {t('extracted.chat.chatMessages.agentname_1f4f686a', {
                            agentName: group.agent_name,
                          })}{' '}
                        </span>
                        {group.content}
                      </p>
                    ))}
                  </div>
                )}
                {streamedContent ? (
                  <p
                    data-pw='chat-streamed-content'
                    className='whitespace-pre-wrap text-sm'
                  >
                    {streamedContent}
                  </p>
                ) : (
                  <div className='flex gap-1'>
                    <span className='animate-bounce text-sm'>
                      {t('extracted.chat.chatMessages.text_cdb4ee2a')}
                    </span>
                    <span className='animate-bounce text-sm [animation-delay:150ms]'>
                      {t('extracted.chat.chatMessages.text_cdb4ee2a')}
                    </span>
                    <span className='animate-bounce text-sm [animation-delay:300ms]'>
                      {t('extracted.chat.chatMessages.text_cdb4ee2a')}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </>
      )}
    </div>
  )
}
