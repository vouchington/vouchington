'use client'

import { useEffect, useRef, useState } from 'react'
import { PageWithAside } from '@/components/page-with-aside'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { GroupThreadHeader } from '@/components/messages/group-thread-header'
import { getGroupConversationLabel } from '@/components/messages/group-conversation-label'
import { ParticipantsPanel } from '@/components/messages/participants-panel'
import { getDirectMessageThreadClient } from '@/lib/api/client/messages'
import onError from '@/lib/on-error'
import type { DirectMessage, DirectMessageParticipant } from '@/types/messages'
import { useResolvedBreadcrumbs } from '@/lib/navigation/use-resolved-breadcrumbs'
import { useTranslations } from '@/lib/i18n/use-translations'
import { DirectMessageComposeForm } from './direct-message-compose-form'
import { DirectMessageList } from './direct-message-list'

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
  const others = liveParticipants.filter(participant => participant.user_id !== currentUserId)
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
    } catch (err) {
      if (generation === generationRef.current && contextConversationId === conversationId) {
        setLoadMoreError(err instanceof Error ? err : new Error(String(err)))
        onError(err, {
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

        <DirectMessageList
          messages={messages}
          currentUserId={currentUserId}
          hasMore={hasMore}
          loadingMore={loadingMore}
          loadMoreError={loadMoreError}
          onLoadMore={() => {
            void handleLoadMore()
          }}
          onClearError={() => setLoadMoreError(null)}
        />
        <DirectMessageComposeForm
          conversationId={conversationId}
          currentUserId={currentUserId}
          setMessages={setMessages}
        />
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
