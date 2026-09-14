'use client'
/* oxlint-disable max-lines -- conversation history, pagination, group management, and compose UI extend the file beyond 200 lines */

import { useEffect, useRef, useState } from 'react'
import { PageWithAside } from '@/components/page-with-aside'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { TimeAgo } from '@/components/shared/time-ago'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import { GroupThreadHeader } from '@/components/messages/group-thread-header'
import { getGroupConversationLabel } from '@/components/messages/group-conversation-label'
import { ParticipantsPanel } from '@/components/messages/participants-panel'
import { sendDirectMessage, getDirectMessageThreadClient } from '@/lib/api/client/messages'
import onError from '@/lib/on-error'
import type { DirectMessage, DirectMessageParticipant } from '@/types/messages'
import { useResolvedBreadcrumbs } from '@/lib/navigation/use-resolved-breadcrumbs'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  conversationId: string
  currentUserId: string
  initialMessages: DirectMessage[]
  initialHasMore: boolean
  initialEndCursor: string | null
  initialParticipants: DirectMessageParticipant[]
  isOwner: boolean
  initialParticipantAddPolicy: 'owner_only' | 'all_members'
}

export function DirectMessagePageClient({
  conversationId,
  currentUserId,
  initialMessages,
  initialHasMore,
  initialEndCursor,
  initialParticipants,
  isOwner,
  initialParticipantAddPolicy,
}: Props) {
  const t = useTranslations()
  const [liveParticipants, setLiveParticipants] =
    useState<DirectMessageParticipant[]>(initialParticipants)
  const others = liveParticipants.filter(p => p.user_id !== currentUserId)
  const conversationName = getGroupConversationLabel(others)

  const breadcrumbItems = useResolvedBreadcrumbs({
    tail: [
      { name: 'Messages', path: '/messages' },
      { name: conversationName, path: `#` },
    ],
  })
  const [messages, setMessages] = useState<DirectMessage[]>(initialMessages)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const endCursorRef = useRef<string | null>(initialEndCursor)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState<Error | null>(null)
  const generationRef = useRef(0)
  const loadingMoreRef = useRef(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    generationRef.current += 1
    return () => {
      generationRef.current += 1
    }
  }, [conversationId])

  async function handleLoadMore() {
    const cursor = endCursorRef.current
    if (!cursor || loadingMoreRef.current) return
    const generation = generationRef.current
    const contextConversationId = conversationId
    loadingMoreRef.current = true
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const result = await getDirectMessageThreadClient(contextConversationId, {
        after: cursor,
      })
      if (generation !== generationRef.current || contextConversationId !== conversationId) return
      setMessages(prev => prependUniqueMessages(prev, result.results))
      setHasMore(result.page_info.has_next_page)
      endCursorRef.current = result.page_info.end_cursor
    } catch (error) {
      if (generation === generationRef.current && contextConversationId === conversationId) {
        setLoadMoreError(error instanceof Error ? error : new Error(String(error)))
        onError(error, {
          fallback: t(
            'extracted.conversationid.conversationPageClient.failedToLoadOlderMessages_a326f2e3',
          ),
        })
      }
    } finally {
      if (generation === generationRef.current && contextConversationId === conversationId) {
        loadingMoreRef.current = false
        setLoadingMore(false)
      }
    }
  }

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || sending) return

    const optimistic: DirectMessage = {
      id: `optimistic-${Date.now()}`,
      conversation_id: conversationId,
      body_text: trimmed,
      created_by_id: currentUserId,
      created_at: new Date().toISOString(),
    }

    setMessages(prev => [...prev, optimistic])
    setText('')
    setSending(true)
    try {
      const result = await sendDirectMessage(conversationId, trimmed)
      setMessages(prev =>
        prev.map(m =>
          m.id === optimistic.id
            ? {
                id: result.message.id,
                conversation_id: result.message.conversation_id,
                body_text: result.message.body_text,
                created_by_id: currentUserId,
                created_at: result.message.created_at,
              }
            : m,
        ),
      )
    } catch (error) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id))
      onError(error, {
        fallback: t('extracted.conversationid.conversationPageClient.failedToSendMessage_66b8e077'),
      })
    } finally {
      setSending(false)
    }
  }

  const aside = (
    <ParticipantsPanel
      conversationId={conversationId}
      currentUserId={currentUserId}
      isOwner={isOwner}
      initialParticipants={liveParticipants}
      initialParticipantAddPolicy={initialParticipantAddPolicy}
      onParticipantsChange={setLiveParticipants}
    />
  )

  return (
    <PageWithAside
      showFooter={false}
      aside={aside}
    >
      <div className='flex h-full flex-col gap-4'>
        <Breadcrumbs items={breadcrumbItems} />

        {liveParticipants.length > 0 && (
          <GroupThreadHeader
            participants={liveParticipants}
            currentUserId={currentUserId}
          />
        )}

        <div
          className='flex-1 space-y-3 overflow-y-auto'
          data-pw='dm-thread-messages'
        >
          {hasMore && !loadMoreError ? (
            <div className='flex justify-center'>
              <Button
                variant='outline'
                size='sm'
                disabled={loadingMore}
                loading={loadingMore}
                data-pw='dm-load-more-button'
                onClick={() => {
                  void handleLoadMore()
                }}
              >
                {t('extracted.conversationid.conversationPageClient.loadOlderMessages_f17671d8')}
              </Button>
            </div>
          ) : null}
          <PaginatedListFooter
            mode='retry-only'
            fetchError={loadMoreError}
            canLoadMore={hasMore}
            loadingMore={loadingMore}
            clearError={() => setLoadMoreError(null)}
            loadMore={() => {
              void handleLoadMore()
            }}
          />
          {messages.length === 0 ? (
            <p className='text-center text-sm text-muted-foreground'>
              {t(
                'extracted.conversationid.conversationPageClient.noMessagesYetSendTheFirst_0b71c4c3',
              )}
            </p>
          ) : null}
          {messages.map(message => (
            <div
              key={message.id}
              className='rounded-lg border bg-card p-3'
            >
              <p className='text-sm font-medium text-muted-foreground'>
                {message.sender_username
                  ? `@${message.sender_username}`
                  : message.created_by_id === currentUserId
                    ? t('extracted.conversationid.conversationPageClient.you_4a5b6c7d')
                    : t('extracted.conversationid.conversationPageClient.member_8e9f0a1b')}
              </p>
              <p className='mt-1 whitespace-pre-wrap break-words text-sm'>{message.body_text}</p>
              <p className='mt-1 text-xs text-muted-foreground'>
                <TimeAgo date={message.created_at} />
              </p>
            </div>
          ))}
        </div>

        <form
          className='flex flex-col gap-2'
          onSubmit={e => {
            e.preventDefault()
            void handleSend()
          }}
        >
          <Textarea
            aria-label={t('extracted.conversationid.conversationPageClient.directMessage_cd3e1605')}
            placeholder={t(
              'extracted.conversationid.conversationPageClient.writeAMessage_dc9f3f9f',
            )}
            value={text}
            onChange={e => setText(e.target.value)}
            disabled={sending}
            data-pw='dm-compose-input'
          />
          <Button
            type='submit'
            disabled={sending || !text.trim()}
            data-pw='dm-send-button'
          >
            {t('extracted.conversationid.conversationPageClient.send_f6f4688f')}
          </Button>
        </form>
      </div>
    </PageWithAside>
  )
}

function prependUniqueMessages(
  existing: DirectMessage[],
  incoming: DirectMessage[],
): DirectMessage[] {
  const seen = new Set(existing.map(message => message.id))
  const uniqueIncoming = incoming.filter(message => {
    if (seen.has(message.id)) return false
    seen.add(message.id)
    return true
  })
  return [...uniqueIncoming, ...existing]
}
